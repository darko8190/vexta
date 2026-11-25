using System.Globalization;
using System.IO.Compression;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Quotes;

public record QuoteSentDto(string Email, DateTimeOffset SentAt, QuoteStatus Status);

/// <summary>
/// The quote as an email. The PDF itself is served by <see cref="QuotesController"/>, where the
/// customer can reach it too.
///
/// The send endpoints answer in the invoice's own shapes — the same recipients, the same copy to
/// employees, the same attachments — so the one send form serves both documents. The quote's
/// documents stand where an invoice offers its project's.
/// </summary>
[ApiController]
[Route("api/soumissions/{id:guid}")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
[RequireActiveSubscription]
public class QuoteSendController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IInvoicePdfService pdf,
    IMailgunService mailgun,
    IR2StorageService storage,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration) : ControllerBase
{
    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    /// <summary>Under Mailgun's own limit, so the answer can name the problem. Same as invoices.</summary>
    private const long MaxAttachmentBytes = 20L * 1024 * 1024;
    private const int MaxBodyLength = 100_000;
    private const int MaxSubjectLength = 300;

    /// <summary>
    /// What the send form opens with: who it can go to (the billing contact first), who can be
    /// put in copy, a covering message already written with this quote's figures, and the
    /// quote's documents. Writes nothing.
    /// </summary>
    [HttpGet("send-defaults")]
    public async Task<ActionResult<InvoiceSendDefaultsDto>> SendDefaults(
        Guid id, [FromQuery] bool relance, CancellationToken ct)
    {
        var quote = await db.Quotes.AsNoTracking()
            .Include(q => q.Client)
            .Include(q => q.Lines)
            .FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return NotFound();

        var recipients = await RecipientsAsync(quote, ct);

        var employees = await db.Employees.AsNoTracking()
            .Where(e => e.Email != "")
            .OrderBy(e => e.FirstName).ThenBy(e => e.LastName)
            .Select(e => new InvoiceRecipientDto(e.Id, e.FirstName + " " + e.LastName, e.Email, e.JobTitle))
            .ToListAsync(ct);

        var documents = await db.QuoteDocuments.AsNoTracking()
            .Where(d => d.QuoteId == id)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new InvoiceAttachmentOptionDto(d.Id, d.Title, d.MediaAsset!.FileName, d.MediaAsset!.OriginalSizeBytes))
            .ToListAsync(ct);

        var company = await CompanyNameAsync(ct);
        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == quote.TenantId, ct);
        var totals = Totals(quote, settings);

        // A customer who can sign in gets the portal link in {{acceptation}}.
        var hasPortal = quote.Client?.UserId is not null
            || await db.ClientContacts.AnyAsync(c => c.ClientId == quote.ClientId && c.UserId != null, ct);

        // Dates the way the PDF prints them, so the message and the attachment agree.
        var validUntil = quote.ValidUntil?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var values = new Dictionary<string, string>
        {
            ["numero"] = $"S-{quote.Number:0000}",
            ["entreprise"] = company,
            ["client"] = quote.Client?.Name ?? "",
            ["contact"] = recipients.FirstOrDefault()?.Name ?? quote.Client?.Name ?? "",
            ["description"] = quote.Description ?? "",
            ["total"] = InvoiceEmailTemplate.Money(totals.Subtotal + totals.Taxes),
            ["sous_total"] = InvoiceEmailTemplate.Money(totals.Subtotal),
            ["taxes"] = InvoiceEmailTemplate.Money(totals.Taxes),
            ["date_emission"] = (quote.IssuedOn ?? DateOnly.FromDateTime(quote.CreatedAt.UtcDateTime))
                .ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["date_validite"] = validUntil ?? "",
            ["validite"] = QuoteEmailTemplate.Validity(validUntil),
            ["devise"] = Currency(settings?.Currency),
            [QuoteEmailTemplate.AcceptField] = QuoteEmailTemplate.AcceptParagraph(
                hasPortal ? $"{FrontendUrl}/soumissions/{quote.Id}" : null)
        };

        // A reminder (relance) has its own wording; everything else about the message is the same.
        var subjectTemplate = relance
            ? QuoteEmailTemplate.ReminderSubject
            : Template(settings?.QuoteEmailSubject) ?? QuoteEmailTemplate.DefaultSubject;
        var bodyTemplate = relance
            ? QuoteEmailTemplate.ReminderBody
            : Template(settings?.QuoteEmailBody) ?? QuoteEmailTemplate.DefaultBody;

        var subject = QuoteEmailTemplate.Render(subjectTemplate, values, escapeHtml: false);
        var body = QuoteEmailTemplate.Render(bodyTemplate, values, escapeHtml: true);

        return Ok(new InvoiceSendDefaultsDto(
            recipients.FirstOrDefault()?.Email, subject, body, recipients, employees, documents));
    }

    /// <summary>
    /// Emails the quote with its PDF attached and marks it sent — only once Mailgun has accepted
    /// the message. A draft becomes Envoyée; an accepted or refused one keeps its status, because
    /// re-sending a copy changes nothing about the client's answer.
    /// </summary>
    [HttpPost("send")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<QuoteSentDto>> Send(Guid id, SendInvoiceRequest request, CancellationToken ct)
    {
        var quote = await db.Quotes.Include(q => q.Client).FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return NotFound();

        var to = request.To?.Trim();
        if (string.IsNullOrWhiteSpace(to)) return BadRequest(new { message = "Indiquez l'adresse courriel du destinataire." });
        if (!IsEmailAddress(to)) return BadRequest(new { message = $"« {to} » n'est pas une adresse courriel valide." });

        var subject = request.Subject?.Trim() ?? string.Empty;
        if (subject.Length == 0) return BadRequest(new { message = "Le courriel a besoin d'un sujet." });
        if (subject.Length > MaxSubjectLength)
            return BadRequest(new { message = $"Le sujet dépasse {MaxSubjectLength} caractères." });

        var body = request.Body?.Trim() ?? string.Empty;
        if (body.Length == 0) return BadRequest(new { message = "Le courriel a besoin d'un message." });
        if (body.Length > MaxBodyLength) return BadRequest(new { message = "Le message est trop long. Mettez le reste en pièce jointe." });

        // Copies by employee id, read back from their records: accepting addresses as given would
        // make this an open relay from the company's own sending domain.
        var ccIds = request.CcEmployeeIds?.Distinct().ToList() ?? [];
        var cc = ccIds.Count == 0
            ? []
            : await db.Employees.AsNoTracking()
                .Where(e => ccIds.Contains(e.Id) && e.Email != "")
                .Select(e => e.Email)
                .ToListAsync(ct);

        var rendered = await pdf.RenderQuoteAsync(id, ct);
        if (rendered is not { } document) return NotFound();

        var attachments = new List<EmailAttachment>
        {
            new($"Soumission-S-{quote.Number:0000}.pdf", "application/pdf", document.Bytes)
        };

        var extras = await AttachmentSourcesAsync(id, request, ct);
        if (extras.Error is { } attachmentError) return BadRequest(new { message = attachmentError });

        long total = document.Bytes.Length;
        foreach (var file in extras.Files)
        {
            byte[] content;
            try
            {
                content = await ReadFromStorageAsync(file.ObjectKey, file.FileName, file.ContentEncoding, ct);
            }
            catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = $"Impossible de lire « {file.FileName} » dans le stockage de fichiers. {ex.Message}"
                });
            }

            total += content.Length;
            if (total > MaxAttachmentBytes)
            {
                return BadRequest(new
                {
                    message = $"Les pièces jointes dépassent {MaxAttachmentBytes / (1024 * 1024)} Mo, la limite de notre service d'envoi. Retirez-en."
                });
            }

            attachments.Add(new EmailAttachment(file.FileName, file.ContentType, content));
        }

        try
        {
            await mailgun.SendWithAttachmentsAsync(
                to,
                await DisplayNameAsync(quote, to, ct),
                subject,
                body,
                cc,
                attachments,
                ct,
                // From the company that gives the price, read from the tenant: a super admin
                // inside a company sends on its behalf.
                await CompanyNameAsync(ct));
        }
        catch (InvalidOperationException ex)
        {
            // Nothing was delivered, so the quote stays as it was.
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }

        quote.SentAt = DateTimeOffset.UtcNow;
        if (quote.Status == QuoteStatus.Brouillon) quote.Status = QuoteStatus.Envoyee;
        // An expired quote sent again with a new date is out with the client again.
        if (quote.Status == QuoteStatus.Expiree && quote.ProjectId is null
            && quote.ValidUntil is { } until && until >= BusinessDay.Today)
            quote.Status = QuoteStatus.Envoyee;
        quote.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(new QuoteSentDto(to, quote.SentAt.Value, quote.Status));
    }

    // ---- Helpers ----

    private record StoredFile(string ObjectKey, string FileName, string ContentType, string? ContentEncoding);

    private static bool IsEmailAddress(string value) =>
        System.Net.Mail.MailAddress.TryCreate(value, out var parsed)
        && string.Equals(parsed.Address, value, StringComparison.OrdinalIgnoreCase)
        && parsed.Host.Contains('.');

    private Task<string> CompanyNameAsync(CancellationToken ct) =>
        db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == currentUser.TenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct)!;

    /// <summary>The same arithmetic as the PDF, so the message and the attachment agree.</summary>
    private static (decimal Subtotal, decimal Taxes) Totals(Quote quote, Domain.BillingSettings? settings)
    {
        var totals = InvoiceTotals.For(
            quote.Lines.Where(l => l.Counts).Select(l => new InvoiceTotals.Line(l.Quantity, l.UnitPrice, true)),
            settings?.GstRate ?? 0m,
            settings?.QstRate ?? 0m,
            quote.IsTaxExempt);
        return (totals.Subtotal, quote.IsTaxExempt ? 0m : totals.TaxTotal);
    }

    private static string Currency(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "CAD" : value.Trim().ToUpperInvariant();

    private static string? Template(string? stored) =>
        string.IsNullOrWhiteSpace(stored) ? null : stored;

    /// <summary>The client's own address, then its contacts — the billing contact first.</summary>
    private async Task<List<InvoiceRecipientDto>> RecipientsAsync(Quote quote, CancellationToken ct)
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

    private async Task<string> DisplayNameAsync(Quote quote, string to, CancellationToken ct)
    {
        if (string.Equals(quote.Client?.Email?.Trim(), to, StringComparison.OrdinalIgnoreCase))
            return quote.Client!.Name;

        var contact = await db.ClientContacts.AsNoTracking()
            .Where(c => c.ClientId == quote.ClientId && c.Email != null && c.Email.ToLower() == to.ToLower())
            .Select(c => c.FirstName + " " + c.LastName)
            .FirstOrDefaultAsync(ct);

        return contact?.Trim() is { Length: > 0 } name ? name : to;
    }

    /// <summary>
    /// Uploads from the form, and documents of this quote chosen by id — checked against the
    /// quote, so the form cannot attach another job's plans by guessing at ids.
    /// </summary>
    private async Task<(string? Error, List<StoredFile> Files)> AttachmentSourcesAsync(
        Guid quoteId, SendInvoiceRequest request, CancellationToken ct)
    {
        var files = new List<StoredFile>();

        var mediaIds = request.MediaAssetIds?.Distinct().ToList() ?? [];
        if (mediaIds.Count > 0)
        {
            var assets = await db.MediaAssets.AsNoTracking()
                .Where(a => mediaIds.Contains(a.Id))
                .Select(a => new StoredFile(a.ObjectKey, a.FileName, a.ContentType, a.ContentEncoding))
                .ToListAsync(ct);
            if (assets.Count != mediaIds.Count)
                return ("Une des pièces jointes est introuvable. Téléversez-la de nouveau.", files);
            files.AddRange(assets);
        }

        var documentIds = request.ProjectDocumentIds?.Distinct().ToList() ?? [];
        if (documentIds.Count == 0) return (null, files);

        var documents = await db.QuoteDocuments.AsNoTracking()
            .Where(d => documentIds.Contains(d.Id) && d.QuoteId == quoteId)
            .Select(d => new StoredFile(
                d.MediaAsset!.ObjectKey, d.MediaAsset!.FileName, d.MediaAsset!.ContentType, d.MediaAsset!.ContentEncoding))
            .ToListAsync(ct);
        if (documents.Count != documentIds.Count)
            return ("Un des documents choisis n'appartient pas à cette soumission.", files);

        files.AddRange(documents);
        return (null, files);
    }

    private async Task<byte[]> ReadFromStorageAsync(
        string objectKey, string fileName, string? contentEncoding, CancellationToken ct)
    {
        var url = await storage.CreateDownloadUrlAsync(objectKey, fileName, ct);
        using var client = httpClientFactory.CreateClient();
        using var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();
        var bytes = await response.Content.ReadAsByteArrayAsync(ct);

        // Inflated only when both the recorded encoding and the gzip magic number agree.
        if (!string.Equals(contentEncoding, "gzip", StringComparison.OrdinalIgnoreCase)) return bytes;
        if (bytes is not [0x1f, 0x8b, ..]) return bytes;

        using var source = new MemoryStream(bytes);
        using var gzip = new GZipStream(source, CompressionMode.Decompress);
        using var inflated = new MemoryStream();
        await gzip.CopyToAsync(inflated, ct);
        return inflated.ToArray();
    }
}
