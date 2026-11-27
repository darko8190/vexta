using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;

namespace Vexta.Api.Features.Quotes;

/// <summary>
/// What a quote's email is made of — who it goes to, the figures its message quotes, its
/// attachment's name. Shared by the send form and the automatic reminder, so a reminder sent by
/// itself reads exactly like one sent from the form.
/// </summary>
public static class QuoteMail
{
    public static Task<string> CompanyNameAsync(VextaDbContext db, Guid? tenantId, CancellationToken ct) =>
        db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct)!;

    /// <summary>The same arithmetic as the PDF, so the message and the attachment agree.</summary>
    public static (decimal Subtotal, decimal Taxes) Totals(Quote quote, Domain.BillingSettings? settings)
    {
        var totals = InvoiceTotals.For(
            quote.Lines.Where(l => l.Counts).Select(l => new InvoiceTotals.Line(l.Quantity, l.UnitPrice, true)),
            settings?.GstRate ?? 0m,
            settings?.QstRate ?? 0m,
            quote.IsTaxExempt);
        return (totals.Subtotal, quote.IsTaxExempt ? 0m : totals.TaxTotal);
    }

    public static string Currency(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "CAD" : value.Trim().ToUpperInvariant();

    /// <summary>« Soumission-S-0012-rev2.pdf »: no accent, since some mail clients mangle them in names.</summary>
    public static string AttachmentName(Quote quote) => $"Soumission-{quote.Label.Replace(" rév. ", "-rev")}.pdf";

    /// <summary>
    /// The fields a quote template is filled with. <paramref name="quote"/> needs its client and
    /// its lines loaded.
    /// </summary>
    public static async Task<Dictionary<string, string>> ValuesAsync(
        VextaDbContext db, Quote quote, Domain.BillingSettings? settings, string company, string contact,
        string frontendUrl, CancellationToken ct)
    {
        var totals = Totals(quote, settings);

        // A customer who can sign in gets the portal link in {{acceptation}}.
        var hasPortal = quote.Client?.UserId is not null
            || await db.ClientContacts.AnyAsync(c => c.ClientId == quote.ClientId && c.UserId != null, ct);

        // The answer link: given a token the first time the message is prepared, written at once
        // so the preview, the email sent and every reminder carry the same link.
        string? responseUrl = null;
        if ((settings?.QuoteEmailCanApprove ?? true) || (settings?.QuoteEmailCanRequestChange ?? true)
            || (settings?.QuoteEmailCanRefuse ?? true))
        {
            if (string.IsNullOrWhiteSpace(quote.ResponseToken))
            {
                var token = NewToken();
                await db.Quotes.IgnoreQueryFilters().Where(q => q.Id == quote.Id)
                    .ExecuteUpdateAsync(set => set.SetProperty(q => q.ResponseToken, token), ct);
                quote.ResponseToken = token;
            }
            responseUrl = ResponseUrl(frontendUrl, quote.ResponseToken);
        }

        // Dates the way the PDF prints them, so the message and the attachment agree.
        var validUntil = quote.ValidUntil?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        return new Dictionary<string, string>
        {
            ["numero"] = quote.Label,
            ["entreprise"] = company,
            ["client"] = quote.Client?.Name ?? "",
            ["contact"] = contact,
            ["description"] = quote.Description ?? "",
            ["total"] = InvoiceEmailTemplate.Money(totals.Subtotal + totals.Taxes),
            ["sous_total"] = InvoiceEmailTemplate.Money(totals.Subtotal),
            ["taxes"] = InvoiceEmailTemplate.Money(totals.Taxes),
            ["date_emission"] = (quote.IssuedOn ?? DateOnly.FromDateTime(quote.CreatedAt.UtcDateTime))
                .ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["date_validite"] = validUntil ?? "",
            ["validite"] = QuoteEmailTemplate.Validity(validUntil),
            ["devise"] = Currency(settings?.Currency),
            [QuoteEmailTemplate.AcceptField] = QuoteEmailTemplate.ResponseParagraph(
                responseUrl,
                settings?.QuoteEmailCanApprove ?? true,
                settings?.QuoteEmailCanRequestChange ?? true,
                settings?.QuoteEmailCanRefuse ?? true,
                hasPortal ? $"{frontendUrl}/soumissions/{quote.Id}" : null)
        };
    }

    /// <summary>32 random bytes: the link is the whole credential, like an invoice's payment link.</summary>
    public static string NewToken() =>
        Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string ResponseUrl(string frontendUrl, string token) =>
        $"{frontendUrl.TrimEnd('/')}/reponse-soumission/{Uri.EscapeDataString(token)}";

    /// <summary>The client's own address, then its contacts — the billing contact first.</summary>
    public static async Task<List<InvoiceRecipientDto>> RecipientsAsync(VextaDbContext db, Quote quote, CancellationToken ct)
    {
        var recipients = new List<InvoiceRecipientDto>();
        if (quote.Client?.Email?.Trim() is { Length: > 0 } clientEmail)
            recipients.Add(new InvoiceRecipientDto(null, quote.Client.Name, clientEmail, "Fiche du client"));

        var contacts = await db.ClientContacts.AsNoTracking()
            .Where(c => c.ClientId == quote.ClientId && c.Email != null && c.Email != "")
            .OrderBy(c => c.FirstName).ThenBy(c => c.LastName)
            .Select(c => new { c.Id, c.FirstName, c.LastName, c.Role, c.Email })
            .ToListAsync(ct);

        recipients.AddRange(contacts.Select(c => new InvoiceRecipientDto(
            c.Id, $"{c.FirstName} {c.LastName}".Trim(), c.Email!.Trim(),
            string.IsNullOrWhiteSpace(c.Role) ? null : c.Role.Trim())));

        if (quote.Client?.BillingContactId is { } billingId
            && recipients.FindIndex(r => r.Id == billingId) is var index and > 0)
        {
            var billing = recipients[index];
            recipients.RemoveAt(index);
            recipients.Insert(0, billing with { Role = "Responsable facturation" });
        }

        return recipients;
    }

    /// <summary>The name to greet: the client's, a contact's, or the address itself.</summary>
    public static async Task<string> DisplayNameAsync(VextaDbContext db, Quote quote, string to, CancellationToken ct)
    {
        if (string.Equals(quote.Client?.Email?.Trim(), to, StringComparison.OrdinalIgnoreCase))
            return quote.Client!.Name;

        var contact = await db.ClientContacts.AsNoTracking()
            .Where(c => c.ClientId == quote.ClientId && c.Email != null && c.Email.ToLower() == to.ToLower())
            .Select(c => c.FirstName + " " + c.LastName)
            .FirstOrDefaultAsync(ct);

        return contact?.Trim() is { Length: > 0 } name ? name : to;
    }
}
