using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;
using Vexta.Api.Features.BillingSettings;

namespace Vexta.Api.Features.Invoices;

[ApiController]
[Route("api/invoices")]
// Client is in the list because a customer reads their own projects and invoices here; the
// query filter is what confines them to their own, and [StaffOnly] on every write is what
// stops them changing anything.
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)},{nameof(UserRole.Client)}")]
[RequireActiveSubscription]
public class InvoicesController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IInvoicePdfService pdf,
    IMailgunService mailgun) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<InvoiceDto>>> List(
        [FromQuery] PagingQuery query,
        [FromQuery] Guid? clientId,
        [FromQuery] Guid? projectId,
        [FromQuery] InvoiceStatus? status)
    {
        var invoices = db.Invoices.AsNoTracking().Include(i => i.Lines).AsQueryable();

        if (clientId is not null) invoices = invoices.Where(i => i.ClientId == clientId);
        if (projectId is not null) invoices = invoices.Where(i => i.ProjectId == projectId);
        if (status is not null) invoices = invoices.Where(i => i.Status == status);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = $"%{query.Search.Trim()}%";
            invoices = invoices.Where(i =>
                EF.Functions.ILike(i.Number, pattern) || EF.Functions.ILike(i.Client!.Name, pattern));
        }

        var totalCount = await invoices.CountAsync();

        var entities = await invoices
            .OrderByDescending(i => i.IssueDate).ThenByDescending(i => i.Number)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Include(i => i.Client)
            .Include(i => i.Project)
            .Include(i => i.PricePolicy)
            .ToListAsync();

        var (gst, qst) = await RatesAsync();
        var items = entities.Select(i => ToDto(i, gst, qst)).ToList();

        return Ok(new PagedResult<InvoiceDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<InvoiceDto>> Get(Guid id)
    {
        var invoice = await LoadAsync(id);
        if (invoice is null) return NotFound();

        var (gst, qst) = await RatesAsync();
        return Ok(ToDto(invoice, gst, qst));
    }

    /// <summary>
    /// The invoice as a document: what gets printed, filed and handed to the client. Open to
    /// the customer it belongs to, like the record itself — the query filter is what keeps
    /// them to their own.
    /// </summary>
    [HttpGet("{id:guid}/pdf")]
    public async Task<IActionResult> Pdf(Guid id, CancellationToken ct)
    {
        var number = await db.Invoices.AsNoTracking()
            .Where(i => i.Id == id)
            .Select(i => i.Number)
            .FirstOrDefaultAsync(ct);

        if (number is null) return NotFound();

        var bytes = await pdf.RenderAsync(id, ct);
        if (bytes is null) return NotFound();

        // Inline, not an attachment: this is shown in a viewer beside the form, and a browser
        // that downloads it instead would turn a preview into a folder full of files.
        Response.Headers.ContentDisposition = $"inline; filename=\"Facture-{number}.pdf\"";
        return File(bytes, "application/pdf");
    }

    /// <summary>
    /// The same document, built from an invoice that has not been saved. Staff only, and it
    /// writes nothing — the number it shows is the one the invoice would be given.
    /// </summary>
    [HttpPost("preview")]
    [StaffOnly]
    public async Task<IActionResult> Preview(
        UpsertInvoiceRequest request, [FromQuery] Guid? invoiceId, CancellationToken ct)
    {
        var bytes = await pdf.RenderDraftAsync(request, invoiceId, ct);
        Response.Headers.ContentDisposition = "inline; filename=\"Apercu-facture.pdf\"";
        return File(bytes, "application/pdf");
    }

    /// <summary>
    /// Emails the invoice to the client with the PDF attached, and marks it sent.
    ///
    /// The status moves only once Mailgun has accepted the message. An invoice that says
    /// "Envoyée" because a button was pressed is worse than no status at all: it is the record
    /// someone checks before chasing a payment that was never asked for.
    /// </summary>
    [HttpPost("{id:guid}/send")]
    [StaffOnly]
    public async Task<ActionResult<InvoiceSentDto>> Send(Guid id, CancellationToken ct)
    {
        var invoice = await db.Invoices
            .Include(i => i.Client)
            .FirstOrDefaultAsync(i => i.Id == id, ct);

        if (invoice is null) return NotFound();

        if (invoice.Status == InvoiceStatus.Annulee)
        {
            return BadRequest(new { message = "Cette facture est annulée. Elle ne peut pas être envoyée." });
        }

        var email = invoice.Client?.Email?.Trim();
        if (string.IsNullOrWhiteSpace(email))
        {
            return BadRequest(new
            {
                message = $"{invoice.Client?.Name ?? "Ce client"} n'a pas de courriel. Ajoutez-le à sa fiche pour lui envoyer la facture."
            });
        }

        var bytes = await pdf.RenderAsync(id, ct);
        if (bytes is null) return NotFound();

        var company = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == invoice.TenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "Votre fournisseur";

        var body =
            $"<p>Bonjour,</p>" +
            $"<p>Vous trouverez ci-jointe la facture <strong>{invoice.Number}</strong> de {company}, " +
            $"datée du {invoice.IssueDate:yyyy-MM-dd} et payable au plus tard le {invoice.DueDate:yyyy-MM-dd}.</p>" +
            $"<p>Merci de votre confiance.</p>" +
            $"<p style=\"color:#666\">{company}</p>";

        try
        {
            await mailgun.SendWithAttachmentAsync(
                email,
                invoice.Client?.Name ?? email,
                $"Facture {invoice.Number} — {company}",
                body,
                $"Facture-{invoice.Number}.pdf",
                "application/pdf",
                bytes,
                ct);
        }
        catch (InvalidOperationException ex)
        {
            // Mailgun's own words, which say which field is wrong. Swallowing them here would
            // leave the company guessing why nothing arrived.
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }

        invoice.SentAt = DateTimeOffset.UtcNow;

        // A paid invoice that is sent again stays paid: the status says where the money is, and
        // re-sending a copy does not unmake a payment.
        if (invoice.Status is InvoiceStatus.Brouillon or InvoiceStatus.Envoyee)
        {
            invoice.Status = InvoiceStatus.Envoyee;
        }

        invoice.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(new InvoiceSentDto(email, invoice.SentAt.Value, invoice.Status));
    }

    // Reading is open to the customer this record belongs to — the query filter already
    // narrows it to theirs. Writing is not: a client does not raise their own invoice, and
    // "they can only see their own" is not the same promise as "they can change it".
    [HttpPost]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<InvoiceDto>> Create(UpsertInvoiceRequest request)
    {
        var clientExists = await db.Clients.AnyAsync(c => c.Id == request.ClientId);
        if (!clientExists) return BadRequest(new { message = "Client introuvable." });

        if (LineProblem(request) is { } lineError) return BadRequest(new { message = lineError });

        var exempt = await ExemptionAsync(request);

        var tenantId = currentUser.TenantId!.Value;

        // An invoice is a legal document. Its number, its tax rates and its payment terms are
        // the company's to decide, and inventing them on their behalf would put wrong figures
        // on something a client pays against.
        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId);
        if (settings is null)
        {
            return BadRequest(new
            {
                message = "Remplissez les paramètres de facturation avant de créer une facture."
            });
        }

        var invoice = new Invoice
        {
            TenantId = tenantId,
            Number = InvoiceNumbering.Format(settings.InvoicePrefix, settings.NextInvoiceNumber),
            ClientId = request.ClientId,
            ProjectId = request.ProjectId,
            Status = request.Status,
            IssueDate = request.IssueDate,
            DueDate = request.DueDate,
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "CAD" : request.Currency.Trim(),
            Notes = request.Notes,
            IsTaxExempt = exempt,
            PricePolicyId = request.PricePolicyId ?? await DefaultPolicyAsync(request.ProjectId),
            Lines = ToLineEntities(request.Lines, exempt)
        };

        // Advanced here, not derived from a count: deleting an invoice must never hand its
        // number to the next one.
        settings.NextInvoiceNumber++;

        db.Invoices.Add(invoice);
        await db.SaveChangesAsync();

        var created = await LoadAsync(invoice.Id);
        var (gst, qst) = await RatesAsync();
        return CreatedAtAction(nameof(Get), new { id = invoice.Id }, ToDto(created!, gst, qst));
    }

    [HttpPut("{id:guid}")]
    [StaffOnly]
    public async Task<ActionResult<InvoiceDto>> Update(Guid id, UpsertInvoiceRequest request)
    {
        var invoice = await db.Invoices.Include(i => i.Lines).FirstOrDefaultAsync(i => i.Id == id);
        if (invoice is null) return NotFound();

        if (LineProblem(request) is { } lineError) return BadRequest(new { message = lineError });

        invoice.ClientId = request.ClientId;
        invoice.ProjectId = request.ProjectId;
        invoice.Status = request.Status;
        invoice.IssueDate = request.IssueDate;
        invoice.DueDate = request.DueDate;
        invoice.Currency = string.IsNullOrWhiteSpace(request.Currency) ? "CAD" : request.Currency.Trim();
        invoice.Notes = request.Notes;
        invoice.IsTaxExempt = request.IsTaxExempt ?? invoice.IsTaxExempt;
        invoice.PricePolicyId = request.PricePolicyId ?? invoice.PricePolicyId;
        invoice.UpdatedAt = DateTimeOffset.UtcNow;

        db.InvoiceLines.RemoveRange(invoice.Lines);
        invoice.Lines = ToLineEntities(request.Lines, invoice.IsTaxExempt);

        await db.SaveChangesAsync();

        var updated = await LoadAsync(id);
        var (gst, qst) = await RatesAsync();
        return Ok(ToDto(updated!, gst, qst));
    }

    [HttpDelete("{id:guid}")]
    [StaffOnly]
    public async Task<IActionResult> Delete(Guid id)
    {
        var invoice = await db.Invoices.FirstOrDefaultAsync(i => i.Id == id);
        if (invoice is null) return NotFound();

        db.Invoices.Remove(invoice);
        await db.SaveChangesAsync();
        return NoContent();
    }



    /// <summary>What an invoice may not be saved without. The preview is allowed both.</summary>
    private static string? LineProblem(UpsertInvoiceRequest request)
    {
        if (request.Lines.Count == 0) return "Ajoutez au moins une ligne à la facture.";
        if (request.Lines.Any(l => string.IsNullOrWhiteSpace(l.Description)))
            return "Chaque ligne a besoin d'une description.";

        return null;
    }

    /// <summary>
    /// The policy a new invoice starts with: the project's, and otherwise the company's
    /// default. Stored on the invoice so a price stays explainable after the policy moves.
    /// </summary>
    private async Task<Guid?> DefaultPolicyAsync(Guid? projectId)
    {
        if (projectId is { } id)
        {
            var fromProject = await db.Projects.AsNoTracking()
                .Where(p => p.Id == id)
                .Select(p => p.PricePolicyId)
                .FirstOrDefaultAsync();

            if (fromProject is not null) return fromProject;
        }

        return await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == currentUser.TenantId)
            .Select(b => b.DefaultPricePolicyId)
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// Where an exempt invoice comes from when the request does not say: the project it belongs
    /// to, and otherwise the client. The exemption is the client's, but a job can be the
    /// exception, so the project's answer wins whenever there is one.
    /// </summary>
    private async Task<bool> ExemptionAsync(UpsertInvoiceRequest request)
    {
        if (request.IsTaxExempt is { } stated) return stated;

        if (request.ProjectId is { } projectId)
        {
            var project = await db.Projects.AsNoTracking()
                .Where(p => p.Id == projectId)
                .Select(p => new { p.IsTaxExempt })
                .FirstOrDefaultAsync();

            if (project is not null) return project.IsTaxExempt;
        }

        return await db.Clients.AsNoTracking()
            .Where(c => c.Id == request.ClientId)
            .Select(c => c.IsTaxExempt)
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// The rate is forced to zero on an exempt invoice rather than trusted from the request.
    /// A stored line that still carries 9.975 on an invoice printed without tax is a document
    /// whose own total contradicts it, and it is the stored lines that get re-totalled later.
    /// </summary>
    private static List<InvoiceLine> ToLineEntities(List<InvoiceLineRequest> lines, bool isTaxExempt) => lines
        .Select((l, index) => new InvoiceLine
        {
            Kind = l.Kind,
            ProductId = l.ProductId,
            Description = l.Description?.Trim() ?? string.Empty,
            Quantity = l.Quantity,
            PurchasePrice = l.PurchasePrice,
            MarginPercent = l.MarginPercent,
            UnitPrice = l.UnitPrice,
            // Forced, not trusted: a line that still claims to be taxable on an invoice printed
            // without tax is a document whose own total contradicts it.
            IsTaxable = !isTaxExempt && l.IsTaxable,
            SortOrder = index
        })
        .ToList();

    private Task<Invoice?> LoadAsync(Guid id) => db.Invoices
        .Include(i => i.Client)
        .Include(i => i.Project)
        .Include(i => i.PricePolicy)
        .Include(i => i.Lines.OrderBy(l => l.SortOrder))
        .FirstOrDefaultAsync(i => i.Id == id);

    /// <summary>
    /// The two rates an invoice is taxed with. They belong to the company, so they are read
    /// once per request rather than carried on every line.
    /// </summary>
    private async Task<(decimal Gst, decimal Qst)> RatesAsync(CancellationToken ct = default)
    {
        var settings = await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == currentUser.TenantId)
            .Select(b => new { b.GstRate, b.QstRate })
            .FirstOrDefaultAsync(ct);

        return (settings?.GstRate ?? 0m, settings?.QstRate ?? 0m);
    }

    internal static string RateLabel(string name, decimal rate) =>
        $"{name} ({rate.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)} %)";

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static InvoiceDto ToDto(Invoice invoice, decimal gstRate, decimal qstRate)
    {
        var lines = invoice.Lines.OrderBy(l => l.SortOrder)
            .Select(l => new InvoiceLineDto(
                l.Id, l.Kind, l.ProductId, l.Description, l.Quantity,
                l.PurchasePrice, l.MarginPercent, l.UnitPrice, l.IsTaxable, l.SortOrder))
            .ToList();

        var subtotal = Round(lines.Sum(l => l.Quantity * l.UnitPrice));

        // Only what is taxable carries tax, and an exempt invoice has nothing taxable on it.
        var taxableBase = invoice.IsTaxExempt
            ? 0m
            : lines.Where(l => l.IsTaxable).Sum(l => l.Quantity * l.UnitPrice);

        var tax1 = Round(taxableBase * gstRate / 100m);
        var tax2 = Round(taxableBase * qstRate / 100m);

        return new InvoiceDto(
            invoice.Id, invoice.Number, invoice.ClientId, invoice.Client?.Name ?? string.Empty,
            invoice.ProjectId, invoice.Project?.Number,
            invoice.Status, invoice.IssueDate, invoice.DueDate, invoice.Currency, invoice.Notes,
            invoice.IsTaxExempt, invoice.PricePolicyId, invoice.PricePolicy?.Name, invoice.SentAt,
            subtotal,
            RateLabel("TPS", gstRate), tax1,
            RateLabel("TVQ", qstRate), tax2,
            tax1 + tax2, subtotal + tax1 + tax2,
            lines, invoice.CreatedAt, invoice.UpdatedAt);
    }
}
