using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Purchasing;

/// <summary>
/// What actually arrived.
///
/// Written by anyone on staff, because the person who signs the packing slip is the person at
/// the back door — not whoever placed the order. Every delivery moves the order's status, which
/// is why nothing here finishes without reading the arithmetic back.
/// </summary>
[ApiController]
[Route("api/receptions")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class GoodsReceiptsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <param name="commande">Only this order's deliveries.</param>
    /// <param name="fournisseur">Only this supplier's.</param>
    [HttpGet]
    public async Task<ActionResult<PagedResult<GoodsReceiptDto>>> List(
        [FromQuery] PagingQuery query,
        [FromQuery] Guid? commande,
        [FromQuery] Guid? fournisseur,
        CancellationToken ct)
    {
        var receipts = db.GoodsReceipts.AsNoTracking().AsQueryable();

        if (commande is { } orderId) receipts = receipts.Where(r => r.PurchaseOrderId == orderId);
        if (fournisseur is { } supplierId) receipts = receipts.Where(r => r.PurchaseOrder!.SupplierId == supplierId);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLower();
            receipts = receipts.Where(r =>
                r.PurchaseOrder!.Number.ToString().Contains(term)
                || r.PurchaseOrder!.Supplier!.Name.ToLower().Contains(term)
                || (r.SlipNumber != null && r.SlipNumber.ToLower().Contains(term)));
        }

        var totalCount = await receipts.CountAsync(ct);

        var items = await receipts
            .OrderByDescending(r => r.ReceivedOn).ThenByDescending(r => r.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(Projection())
            .ToListAsync(ct);

        return Ok(new PagedResult<GoodsReceiptDto>
        {
            Items = items,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalCount = totalCount
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GoodsReceiptDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var receipt = await db.GoodsReceipts.AsNoTracking().Where(r => r.Id == id).Select(Projection()).FirstOrDefaultAsync(ct);
        if (receipt is null) return NotFound();

        var lines = await db.GoodsReceiptLines.AsNoTracking()
            .Where(l => l.GoodsReceiptId == id)
            .OrderBy(l => l.PurchaseOrderLine!.SortOrder)
            .Select(l => new GoodsReceiptLineDto(
                l.Id,
                l.PurchaseOrderLineId,
                l.PurchaseOrderLine!.Description,
                l.PurchaseOrderLine!.Unit,
                l.Quantity))
            .ToListAsync(ct);

        return Ok(new GoodsReceiptDetailDto(receipt, lines));
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<GoodsReceiptDetailDto>> Create(SaveGoodsReceiptRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var order = await db.PurchaseOrders.FirstOrDefaultAsync(o => o.Id == request.PurchaseOrderId, ct);
        if (order is null) return BadRequest(new { message = "Cette commande n'existe plus." });

        if (order.Status == PurchaseOrderStatus.Annulee)
        {
            return Conflict(new { message = "Cette commande a été annulée." });
        }

        if (request.Lines is null || request.Lines.Count == 0)
        {
            return BadRequest(new { message = "Dites ce qui est arrivé : une réception vide ne note rien." });
        }

        // Every line has to belong to this order. The ids come from a browser, and one pointing
        // at another order's line would credit a delivery against something nobody ordered here.
        var orderLineIds = await db.PurchaseOrderLines
            .Where(l => l.PurchaseOrderId == order.Id)
            .Select(l => l.Id)
            .ToListAsync(ct);

        foreach (var line in request.Lines)
        {
            if (!orderLineIds.Contains(line.PurchaseOrderLineId))
            {
                return BadRequest(new { message = "Une des lignes reçues n'appartient pas à cette commande." });
            }
            if (line.Quantity <= 0)
            {
                return BadRequest(new { message = "Une quantité reçue doit être supérieure à zéro. Laissez la ligne de côté si rien n'est arrivé." });
            }
        }

        var receipt = new GoodsReceipt
        {
            TenantId = tenantId,
            PurchaseOrderId = order.Id,
            ReceivedOn = request.ReceivedOn ?? BusinessDay.Today,
            SlipNumber = Clean(request.SlipNumber),
            Note = Clean(request.Note),
            ReceivedByUserId = currentUser.UserId
        };

        db.GoodsReceipts.Add(receipt);

        foreach (var line in request.Lines)
        {
            db.GoodsReceiptLines.Add(new GoodsReceiptLine
            {
                TenantId = tenantId,
                GoodsReceiptId = receipt.Id,
                PurchaseOrderLineId = line.PurchaseOrderLineId,
                Quantity = line.Quantity
            });
        }

        // A delivery against a draft means the order went out some other way — by phone, at the
        // counter. Recording it is right; leaving the order a draft afterwards is not.
        if (order.Status == PurchaseOrderStatus.Brouillon)
        {
            order.Status = PurchaseOrderStatus.Envoyee;
        }

        await db.SaveChangesAsync(ct);
        await PurchaseOrdersController.RefreshStatusAsync(db, order.Id, ct);

        return await Get(receipt.Id, ct);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var receipt = await db.GoodsReceipts.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (receipt is null) return NotFound();

        var orderId = receipt.PurchaseOrderId;

        db.GoodsReceipts.Remove(receipt);
        await db.SaveChangesAsync(ct);

        // The order goes back to what the remaining deliveries say, which may be back to Envoyée.
        await PurchaseOrdersController.RefreshStatusAsync(db, orderId, ct);
        return NoContent();
    }

    // ---- Helpers ----

    private static System.Linq.Expressions.Expression<Func<GoodsReceipt, GoodsReceiptDto>> Projection() =>
        r => new GoodsReceiptDto(
            r.Id,
            r.PurchaseOrderId,
            r.PurchaseOrder!.Number,
            r.PurchaseOrder!.SupplierId,
            r.PurchaseOrder!.Supplier!.Name,
            r.ReceivedOn,
            r.SlipNumber,
            r.Note,
            r.Lines.Count,
            r.CreatedAt);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
