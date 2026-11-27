using System.Globalization;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.BillingSettings;

namespace Vexta.Api.Features.Invoices;

public interface IInvoicePdfService
{
    /// <summary>The saved invoice, or null when there is none to read here.</summary>
    Task<byte[]?> RenderAsync(Guid invoiceId, CancellationToken ct = default);

    /// <summary>
    /// The invoice being typed, printed through the same code as the saved one. The preview
    /// beside the form is the document itself, not a drawing of it — which is the only way it
    /// can be trusted to catch a wrong address before it is sent.
    ///
    /// Pass the id when an existing invoice is being edited, so the document carries its own
    /// number rather than the one the next invoice will be given.
    /// </summary>
    Task<byte[]> RenderDraftAsync(UpsertInvoiceRequest request, Guid? invoiceId = null, CancellationToken ct = default);

    /// <summary>
    /// A quote, printed through the invoice's layout with the quote's own words — the same
    /// company header, the same lines and taxes, an acceptance block in place of the receipt.
    /// Null when there is no such quote here.
    /// </summary>
    Task<(byte[] Bytes, string Label)?> RenderQuoteAsync(Guid quoteId, CancellationToken ct = default);
}

public class InvoicePdfService(VextaDbContext db, ICurrentUserService currentUser) : IInvoicePdfService
{
    public async Task<byte[]?> RenderAsync(Guid invoiceId, CancellationToken ct = default)
    {
        var invoice = await db.Invoices.AsNoTracking()
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, ct);

        if (invoice is null) return null;

        var model = await BuildAsync(
            invoice.TenantId,
            invoice.Number,
            invoice.ClientId,
            invoice.ProjectId,
            invoice.IssueDate,
            invoice.DueDate,
            invoice.Currency,
            invoice.Notes,
            invoice.Lines.OrderBy(l => l.SortOrder)
                .Select(l => (l.Description, l.Quantity, l.UnitPrice, l.IsTaxable))
                .ToList(),
            invoice.IsTaxExempt,
            ct);

        return new InvoiceDocument(model).GeneratePdf();
    }

    public async Task<byte[]> RenderDraftAsync(
        UpsertInvoiceRequest request, Guid? invoiceId = null, CancellationToken ct = default)
    {
        var tenantId = currentUser.TenantId!.Value;

        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);

        var existing = invoiceId is { } id
            ? await db.Invoices.AsNoTracking()
                .Where(i => i.Id == id)
                .Select(i => new { i.Number, i.Currency })
                .FirstOrDefaultAsync(ct)
            : null;

        var model = await BuildAsync(
            tenantId,
            // An invoice being edited keeps its own number. A new one shows the number it will
            // be given, rather than nothing: an invoice with no number reads like a quote.
            existing?.Number ?? InvoiceNumbering.Format(
                settings?.InvoicePrefix ?? "F",
                settings?.NextInvoiceNumber ?? 1),
            request.ClientId,
            request.ProjectId,
            request.IssueDate,
            request.DueDate,
            // The company's currency, not the form's — the form no longer asks. An invoice being
            // edited is previewed in the currency it was issued in, which is the one stored on it.
            existing?.Currency ?? settings?.Currency ?? "CAD",
            request.Notes,
            request.Lines.Select(l => (l.Description ?? string.Empty, l.Quantity, l.UnitPrice, l.IsTaxable)).ToList(),
            await DraftExemptionAsync(request, invoiceId, ct),
            ct);

        return new InvoiceDocument(model).GeneratePdf();
    }

    /// <summary>The company's local day and time of an online signature, as the paper prints them.</summary>
    private static InvoicePdfSignature Signed(string name, DateTimeOffset at, byte[]? drawn)
    {
        var local = BusinessDay.ToLocal(at);
        return new InvoicePdfSignature(
            name,
            local.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            $"Signée électroniquement dans le portail client par {name}, le {local:yyyy-MM-dd} à {local:HH} h {local:mm}.",
            drawn);
    }

    public async Task<(byte[] Bytes, string Label)?> RenderQuoteAsync(Guid quoteId, CancellationToken ct = default)
    {
        var quote = await db.Quotes.AsNoTracking()
            .Include(q => q.Lines)
            .Include(q => q.Client!).ThenInclude(c => c.Addresses)
            .Include(q => q.ClientAddress)
            .Include(q => q.SiteAddress)
            .FirstOrDefaultAsync(q => q.Id == quoteId, ct);

        if (quote is null) return null;

        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == quote.TenantId, ct);
        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == quote.TenantId, ct);
        var location = await db.CompanyLocations.AsNoTracking()
            .OrderByDescending(l => l.IsPrimary).ThenBy(l => l.CreatedAt)
            .FirstOrDefaultAsync(ct);
        var logo = await db.TenantLogos.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.TenantId == quote.TenantId)
            .Select(l => l.Content)
            .FirstOrDefaultAsync(ct);

        var client = quote.Client;
        var billingAddress = quote.ClientAddress
            ?? client?.Addresses.FirstOrDefault(a => a.IsPrimary)
            ?? client?.Addresses.FirstOrDefault();
        var siteAddress = quote.SameAddressAsClient ? null : quote.SiteAddress;

        // Labour first, then materials, then the extra charges: the order the price is built in,
        // and the order a client reads a quote to see where the money goes.
        // Options taken print with the rest, marked; the others go in their own list, outside the total.
        var all = quote.Lines
            .OrderBy(l => l.Kind).ThenBy(l => l.SortOrder).ThenBy(l => l.CreatedAt)
            .ToList();
        var ordered = all.Where(l => l.Counts).ToList();

        static InvoicePdfLine Print(QuoteLine l)
        {
            var description = l.Kind == QuoteLineKind.Tache ? $"{l.Description.Trim()} (main-d'œuvre)" : l.Description.Trim();
            if (l.IsOptional && l.IsSelected) description += " (option retenue)";
            return new InvoicePdfLine(description, l.Quantity, l.UnitPrice, Round(l.Quantity * l.UnitPrice));
        }

        var items = ordered.Select(Print).ToList();
        // An assembly's materials are what it is made of, not something to choose.
        var options = all.Where(l => !l.Counts && l.ParentLineId == null).Select(Print).ToList();

        var totals = InvoiceTotals.For(
            ordered.Select(l => new InvoiceTotals.Line(l.Quantity, l.UnitPrice, true)),
            settings?.GstRate ?? 0m,
            settings?.QstRate ?? 0m,
            quote.IsTaxExempt);
        var taxes = quote.IsTaxExempt ? ExemptLine : TaxLines(totals, settings);

        var number = quote.Label;
        var model = new InvoicePdfModel
        {
            Number = number,
            IssueDate = quote.IssuedOn ?? DateOnly.FromDateTime(quote.CreatedAt.UtcDateTime),
            DueDate = quote.ValidUntil,
            PoNumber = quote.PoNumber,
            Currency = settings?.Currency ?? "CAD",
            Notes = Clean(quote.Description),
            CompanyName = tenant?.Name ?? "",
            CompanyLines = CompanyLines(location, tenant, settings),
            Logo = logo,
            BrandColor = tenant?.BrandColor,
            BillTo = new InvoicePdfParty(client?.Name ?? "", AddressLines(billingAddress), Clean(client?.Email)),
            SiteAddress = AddressLines(siteAddress),
            Lines = items,
            Subtotal = totals.Subtotal,
            Taxes = taxes,
            Total = totals.Subtotal + taxes.Sum(t => t.Amount),
            // No payment terms: "Payable à réception" is the invoice's promise, and on a quote it
            // would ask for money nobody owes yet.
            FooterNote = Clean(settings?.FooterNote),
            // The quote's own conditions (warranty, delays, exclusions), printed above the signature.
            Terms = Clean(settings?.QuoteTerms),
            Options = options,
            Wording = InvoicePdfWording.Quote,
            Signature = quote.ClientSignature is { } typed && quote.ClientRespondedAt is { } at
                ? Signed(typed, at, quote.ClientSignaturePng)
                : null,
        };

        return (new InvoiceDocument(model).GeneratePdf(), quote.Label);
    }

    /// <summary>
    /// Whether the invoice being typed is exempt: what the form says, then the invoice as it
    /// stands, then the project, then the client. The same ladder the controller climbs when it
    /// saves, so the preview cannot promise tax the saved invoice will not charge.
    /// </summary>
    private async Task<bool> DraftExemptionAsync(
        UpsertInvoiceRequest request, Guid? invoiceId, CancellationToken ct)
    {
        if (request.IsTaxExempt is { } stated) return stated;

        if (invoiceId is { } id)
        {
            var saved = await db.Invoices.AsNoTracking()
                .Where(i => i.Id == id)
                .Select(i => new { i.IsTaxExempt })
                .FirstOrDefaultAsync(ct);

            if (saved is not null) return saved.IsTaxExempt;
        }

        if (request.ProjectId is { } projectId)
        {
            var project = await db.Projects.AsNoTracking()
                .Where(p => p.Id == projectId)
                .Select(p => new { p.IsTaxExempt })
                .FirstOrDefaultAsync(ct);

            if (project is not null) return project.IsTaxExempt;
        }

        return await db.Clients.AsNoTracking()
            .Where(c => c.Id == request.ClientId)
            .Select(c => c.IsTaxExempt)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<InvoicePdfModel> BuildAsync(
        Guid tenantId,
        string number,
        Guid clientId,
        Guid? projectId,
        DateOnly issueDate,
        DateOnly dueDate,
        string currency,
        string? notes,
        IReadOnlyList<(string Description, decimal Quantity, decimal UnitPrice, bool IsTaxable)> lines,
        bool isTaxExempt,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tenantId, ct);

        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);

        var location = await db.CompanyLocations.AsNoTracking()
            .OrderByDescending(l => l.IsPrimary).ThenBy(l => l.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var logo = await db.TenantLogos.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.TenantId == tenantId)
            .Select(l => l.Content)
            .FirstOrDefaultAsync(ct);

        var client = await db.Clients.AsNoTracking()
            .Include(c => c.Addresses)
            .FirstOrDefaultAsync(c => c.Id == clientId, ct);

        var project = projectId is { } id
            ? await db.Projects.AsNoTracking()
                .Include(p => p.ClientAddress)
                .Include(p => p.SiteAddress)
                .FirstOrDefaultAsync(p => p.Id == id, ct)
            : null;

        var billingAddress = project?.ClientAddress
            ?? client?.Addresses.FirstOrDefault(a => a.IsPrimary)
            ?? client?.Addresses.FirstOrDefault();

        // The work address is only ever printed for a project: without one there is nothing
        // that says where the work happened, and repeating the billing address under a second
        // heading would be dressing a guess up as a fact.
        var siteAddress = project is null
            ? null
            : project.SameAddressAsClient ? (project.ClientAddress ?? billingAddress) : project.SiteAddress;

        var items = lines
            .Where(l => !string.IsNullOrWhiteSpace(l.Description) || l.UnitPrice != 0 || l.Quantity != 0)
            .Select(l => new InvoicePdfLine(
                l.Description.Trim(),
                l.Quantity,
                l.UnitPrice,
                Round(l.Quantity * l.UnitPrice)))
            .ToList();

        // One arithmetic, shared with the screen and with payments: see InvoiceTotals.
        var totals = InvoiceTotals.For(
            lines.Select(l => new InvoiceTotals.Line(l.Quantity, l.UnitPrice, l.IsTaxable)),
            settings?.GstRate ?? 0m,
            settings?.QstRate ?? 0m,
            isTaxExempt);

        var subtotal = totals.Subtotal;
        var taxes = isTaxExempt ? ExemptLine : TaxLines(totals, settings);

        return new InvoicePdfModel
        {
            Number = number,
            IssueDate = issueDate,
            DueDate = dueDate,
            ProjectLabel = project is null ? null : ProjectNumber(project.Number),
            PoNumber = project?.PoNumber,
            Currency = string.IsNullOrWhiteSpace(currency) ? "CAD" : currency.Trim(),
            Notes = Clean(notes),
            CompanyName = tenant?.Name ?? "",
            CompanyLines = CompanyLines(location, tenant, settings),
            Logo = logo,
            BrandColor = tenant?.BrandColor,
            BillTo = new InvoicePdfParty(
                client?.Name ?? "",
                AddressLines(billingAddress),
                Clean(client?.Email)),
            SiteAddress = AddressLines(siteAddress),
            Lines = items,
            Subtotal = subtotal,
            Taxes = taxes,
            Total = subtotal + taxes.Sum(t => t.Amount),
            Terms = Clean(settings?.Terms),
            FooterNote = Clean(settings?.FooterNote)
        };
    }

    /// <summary>
    /// What an exempt invoice prints where the taxes go. Zero stated rather than nothing shown:
    /// an invoice with no tax line and no explanation reads like one where the tax was
    /// forgotten, and that is a question the company then has to answer by telephone.
    /// </summary>
    private static readonly List<InvoicePdfAmount> ExemptLine = [new InvoicePdfAmount("Non taxable", 0m)];

    /// <summary>
    /// The two amounts InvoiceTotals worked out, given the names the paper has to show: a Québec
    /// invoice carries the TPS and the TVQ with the registration numbers they were charged
    /// under, and a single "Taxes" figure is the one thing a supplier gets asked to break down.
    ///
    /// Nothing to print when the company has no settings yet, or when nothing on the invoice is
    /// taxable — a 0,00 $ TPS line on a labour-only invoice invites a question that has no
    /// interesting answer.
    /// </summary>
    private static List<InvoicePdfAmount> TaxLines(
        InvoiceTotalsResult totals, Domain.BillingSettings? settings)
    {
        if (settings is null || totals.TaxTotal == 0) return [];

        return
        [
            new InvoicePdfAmount(TaxLabel("TPS", settings.GstRate, settings.GstNumber), totals.Gst),
            new InvoicePdfAmount(TaxLabel("TVQ", settings.QstRate, settings.QstNumber), totals.Qst)
        ];
    }

    private static string TaxLabel(string name, decimal rate, string? registration)
    {
        var label = $"{name} ({rate.ToString("0.###", Formats.Quebec)} %)";
        return string.IsNullOrWhiteSpace(registration) ? label : $"{label} #{registration.Trim()}";
    }

    private static IReadOnlyList<string> CompanyLines(
        CompanyLocation? location, Tenant? tenant, Domain.BillingSettings? settings)
    {
        var lines = new List<string>();

        if (location is not null)
        {
            lines.AddRange(AddressLines(location.Line1, location.Line2, location.City, location.Province, location.PostalCode));
        }

        var phone = location?.Phone ?? tenant?.Phone;
        if (!string.IsNullOrWhiteSpace(phone)) lines.Add(phone.Trim());
        if (!string.IsNullOrWhiteSpace(tenant?.ContactEmail)) lines.Add(tenant.ContactEmail.Trim());
        if (!string.IsNullOrWhiteSpace(settings?.RbqNumber)) lines.Add($"RBQ: {settings.RbqNumber.Trim()}");

        return lines;
    }

    private static IReadOnlyList<string> AddressLines(Address? address) => address is null
        ? []
        : AddressLines(address.Line1, address.Line2, address.City, address.Province, address.PostalCode);

    private static List<string> AddressLines(string line1, string? line2, string city, string? province, string postalCode)
    {
        var lines = new List<string> { line1 };
        if (!string.IsNullOrWhiteSpace(line2)) lines.Add(line2.Trim());

        var place = string.IsNullOrWhiteSpace(province) ? city : $"{city}, ({province.Trim()})";
        lines.Add(string.IsNullOrWhiteSpace(postalCode) ? place : $"{place}  {postalCode.Trim()}");

        return lines;
    }

    private static string ProjectNumber(int number) => $"P-{number:0000}";

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
