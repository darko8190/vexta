using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

[ApiController]
[Route("api/invoices")]
// Client is in the list because a customer reads their own projects and invoices here; the
// query filter is what confines them to their own, and [StaffOnly] on every write is what
// stops them changing anything.
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)},{nameof(UserRole.Client)}")]
[RequireActiveSubscription]
public class InvoicesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<InvoiceDto>>> List(
        [FromQuery] PagingQuery query, [FromQuery] Guid? clientId, [FromQuery] InvoiceStatus? status)
    {
        var invoices = db.Invoices.AsNoTracking().Include(i => i.Lines).AsQueryable();

        if (clientId is not null) invoices = invoices.Where(i => i.ClientId == clientId);
        if (status is not null) invoices = invoices.Where(i => i.Status == status);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            invoices = invoices.Where(i => i.Number.Contains(query.Search) || i.Client!.Name.Contains(query.Search));
        }

        var totalCount = await invoices.CountAsync();

        var entities = await invoices
            .OrderByDescending(i => i.IssueDate).ThenByDescending(i => i.Number)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Include(i => i.Client)
            .Include(i => i.Project)
            .ToListAsync();

        var items = entities.Select(ToDto).ToList();

        return Ok(new PagedResult<InvoiceDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<InvoiceDto>> Get(Guid id)
    {
        var invoice = await LoadAsync(id);
        return invoice is null ? NotFound() : Ok(ToDto(invoice));
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

        if (request.Lines.Count == 0)
        {
            return BadRequest(new { message = "Ajoutez au moins une ligne à la facture." });
        }

        var tenantId = currentUser.TenantId!.Value;
        var invoice = new Invoice
        {
            TenantId = tenantId,
            Number = await NextInvoiceNumberAsync(tenantId),
            ClientId = request.ClientId,
            ProjectId = request.ProjectId,
            Status = request.Status,
            IssueDate = request.IssueDate,
            DueDate = request.DueDate,
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "CAD" : request.Currency.Trim(),
            Notes = request.Notes,
            Lines = ToLineEntities(request.Lines)
        };

        db.Invoices.Add(invoice);
        await db.SaveChangesAsync();

        var created = await LoadAsync(invoice.Id);
        return CreatedAtAction(nameof(Get), new { id = invoice.Id }, ToDto(created!));
    }

    [HttpPut("{id:guid}")]
    [StaffOnly]
    public async Task<ActionResult<InvoiceDto>> Update(Guid id, UpsertInvoiceRequest request)
    {
        var invoice = await db.Invoices.Include(i => i.Lines).FirstOrDefaultAsync(i => i.Id == id);
        if (invoice is null) return NotFound();

        if (request.Lines.Count == 0)
        {
            return BadRequest(new { message = "Ajoutez au moins une ligne à la facture." });
        }

        invoice.ClientId = request.ClientId;
        invoice.ProjectId = request.ProjectId;
        invoice.Status = request.Status;
        invoice.IssueDate = request.IssueDate;
        invoice.DueDate = request.DueDate;
        invoice.Currency = string.IsNullOrWhiteSpace(request.Currency) ? "CAD" : request.Currency.Trim();
        invoice.Notes = request.Notes;
        invoice.UpdatedAt = DateTimeOffset.UtcNow;

        db.InvoiceLines.RemoveRange(invoice.Lines);
        invoice.Lines = ToLineEntities(request.Lines);

        await db.SaveChangesAsync();

        var updated = await LoadAsync(id);
        return Ok(ToDto(updated!));
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

    private async Task<string> NextInvoiceNumberAsync(Guid tenantId)
    {
        var count = await db.Invoices.IgnoreQueryFilters().CountAsync(i => i.TenantId == tenantId);
        return $"INV-{count + 1:0000}";
    }

    private static List<InvoiceLine> ToLineEntities(List<InvoiceLineRequest> lines) => lines
        .Select((l, index) => new InvoiceLine
        {
            Description = l.Description.Trim(),
            Quantity = l.Quantity,
            UnitPrice = l.UnitPrice,
            TaxRatePercent = l.TaxRatePercent,
            SortOrder = index
        })
        .ToList();

    private Task<Invoice?> LoadAsync(Guid id) => db.Invoices
        .Include(i => i.Client)
        .Include(i => i.Project)
        .Include(i => i.Lines.OrderBy(l => l.SortOrder))
        .FirstOrDefaultAsync(i => i.Id == id);

    private static InvoiceDto ToDto(Invoice invoice)
    {
        var lines = invoice.Lines.OrderBy(l => l.SortOrder)
            .Select(l => new InvoiceLineDto(l.Id, l.Description, l.Quantity, l.UnitPrice, l.TaxRatePercent, l.SortOrder))
            .ToList();

        var subtotal = lines.Sum(l => l.Quantity * l.UnitPrice);
        var taxTotal = lines.Sum(l => l.Quantity * l.UnitPrice * l.TaxRatePercent / 100m);

        return new InvoiceDto(
            invoice.Id, invoice.Number, invoice.ClientId, invoice.Client?.Name ?? string.Empty,
            invoice.ProjectId, invoice.Project?.Name,
            invoice.Status, invoice.IssueDate, invoice.DueDate, invoice.Currency, invoice.Notes,
            subtotal, taxTotal, subtotal + taxTotal, lines, invoice.CreatedAt, invoice.UpdatedAt);
    }
}
