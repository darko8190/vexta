using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

public record InvoiceAutoFeeDto(
    Guid Id, string Description, decimal Quantity, decimal UnitPrice, bool IsTaxable, bool IsActive, int SortOrder);

public record SaveInvoiceAutoFeeRequest(string Description, decimal Quantity, decimal UnitPrice, bool IsTaxable, bool IsActive);

/// <summary>The lines every new invoice starts with, from Paramètres → Facturation → Frais automatiques.</summary>
public static class InvoiceAutoFees
{
    /// <summary>
    /// Adds the company's active automatic fees at the end of an invoice being created. Does not
    /// save. A tax-exempt invoice takes them untaxed, like every other line on it.
    /// </summary>
    public static async Task AppendAsync(VextaDbContext db, Invoice invoice, CancellationToken ct)
    {
        var fees = await db.InvoiceAutoFees.AsNoTracking()
            .Where(f => f.TenantId == invoice.TenantId && f.IsActive)
            .OrderBy(f => f.SortOrder).ThenBy(f => f.CreatedAt)
            .ToListAsync(ct);
        var order = invoice.Lines.Count == 0 ? 0 : invoice.Lines.Max(l => l.SortOrder) + 1;
        foreach (var fee in fees)
        {
            invoice.Lines.Add(new InvoiceLine
            {
                Kind = InvoiceLineKind.FraisSupplementaires,
                Description = fee.Description,
                Quantity = fee.Quantity,
                UnitPrice = fee.UnitPrice,
                IsTaxable = fee.IsTaxable && !invoice.IsTaxExempt,
                SortOrder = order++
            });
        }
    }
}

[ApiController]
[Route("api/frais-automatiques")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
[RequireActiveSubscription]
public class InvoiceAutoFeesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<InvoiceAutoFeeDto>>> List(CancellationToken ct) =>
        Ok(await db.InvoiceAutoFees.AsNoTracking()
            .OrderBy(f => f.SortOrder).ThenBy(f => f.CreatedAt)
            .Select(f => new InvoiceAutoFeeDto(f.Id, f.Description, f.Quantity, f.UnitPrice, f.IsTaxable, f.IsActive, f.SortOrder))
            .ToListAsync(ct));

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<InvoiceAutoFeeDto>> Create(SaveInvoiceAutoFeeRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        var next = await db.InvoiceAutoFees.MaxAsync(f => (int?)f.SortOrder, ct) ?? -1;
        var fee = new InvoiceAutoFee { TenantId = tenantId, Description = "", SortOrder = next + 1 };
        Apply(fee, request);
        db.InvoiceAutoFees.Add(fee);
        await db.SaveChangesAsync(ct);
        return Ok(ToDto(fee));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<InvoiceAutoFeeDto>> Update(Guid id, SaveInvoiceAutoFeeRequest request, CancellationToken ct)
    {
        var fee = await db.InvoiceAutoFees.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (fee is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        Apply(fee, request);
        await db.SaveChangesAsync(ct);
        return Ok(ToDto(fee));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var fee = await db.InvoiceAutoFees.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (fee is null) return NotFound();
        db.InvoiceAutoFees.Remove(fee);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Problem(SaveInvoiceAutoFeeRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Description)) return "La description est requise.";
        if (r.Description.Trim().Length > 500) return "La description est trop longue.";
        if (r.Quantity <= 0) return "La quantité doit être plus grande que zéro.";
        return null;
    }

    private static void Apply(InvoiceAutoFee fee, SaveInvoiceAutoFeeRequest r)
    {
        fee.Description = r.Description.Trim();
        fee.Quantity = r.Quantity;
        fee.UnitPrice = Math.Round(r.UnitPrice, 2);
        fee.IsTaxable = r.IsTaxable;
        fee.IsActive = r.IsActive;
    }

    private static InvoiceAutoFeeDto ToDto(InvoiceAutoFee f) =>
        new(f.Id, f.Description, f.Quantity, f.UnitPrice, f.IsTaxable, f.IsActive, f.SortOrder);
}
