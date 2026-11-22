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

        var existingNumber = invoiceId is { } id
            ? await db.Invoices.AsNoTracking().Where(i => i.Id == id).Select(i => i.Number).FirstOrDefaultAsync(ct)
            : null;

        var model = await BuildAsync(
            tenantId,
            // An invoice being edited keeps its own number. A new one shows the number it will
            // be given, rather than nothing: an invoice with no number reads like a quote.
            existingNumber ?? InvoiceNumbering.Format(
                settings?.InvoicePrefix ?? "F",
                settings?.NextInvoiceNumber ?? 1),
            request.ClientId,
            request.ProjectId,
            request.IssueDate,
            request.DueDate,
            request.Currency,
            request.Notes,
            request.Lines.Select(l => (l.Description ?? string.Empty, l.Quantity, l.UnitPrice, l.IsTaxable)).ToList(),
            await DraftExemptionAsync(request, invoiceId, ct),
            ct);

        return new InvoiceDocument(model).GeneratePdf();
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

        var subtotal = Round(items.Sum(l => l.Amount));
        var taxes = isTaxExempt ? ExemptLine : TaxLines(lines, settings);

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
    /// The company's two taxes, each on the lines that carry tax. They are always both printed
    /// and always separate: a Québec invoice has to show the TPS and the TVQ with the
    /// registration numbers they were charged under, and a single "Taxes" figure is the one
    /// thing a supplier gets asked to break down.
    /// </summary>
    private static List<InvoicePdfAmount> TaxLines(
        IReadOnlyList<(string Description, decimal Quantity, decimal UnitPrice, bool IsTaxable)> lines,
        Domain.BillingSettings? settings)
    {
        if (settings is null) return [];

        var taxableBase = lines.Where(l => l.IsTaxable).Sum(l => l.Quantity * l.UnitPrice);
        if (taxableBase == 0) return [];

        return
        [
            new InvoicePdfAmount(TaxLabel("TPS", settings.GstRate, settings.GstNumber),
                Round(taxableBase * settings.GstRate / 100m)),
            new InvoicePdfAmount(TaxLabel("TVQ", settings.QstRate, settings.QstNumber),
                Round(taxableBase * settings.QstRate / 100m))
        ];
    }

    private static string TaxLabel(string name, decimal rate, string? registration)
    {
        var label = $"{name} ({rate.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)} %)";
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
