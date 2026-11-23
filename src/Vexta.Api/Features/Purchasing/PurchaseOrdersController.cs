using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Purchasing;

/// <summary>
/// Orders placed with suppliers.
///
/// The status is only ever set by hand for the two ends — sent, cancelled. Whether something is
/// partly or fully received is worked out from the deliveries, because a flag somebody ticks is
/// a flag that disagrees with the yard by Thursday.
/// </summary>
[ApiController]
[Route("api/commandes")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class PurchaseOrdersController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <param name="recherche">Matches the order number, the supplier, or their reference.</param>
    /// <param name="fournisseur">Only this supplier's orders.</param>
    /// <param name="projet">Only what was bought for this job.</param>
    /// <param name="statut">Only orders in this state.</param>
    [HttpGet]
    public async Task<ActionResult<PagedResult<PurchaseOrderDto>>> List(
        [FromQuery] PagingQuery query,
        [FromQuery] string? recherche,
        [FromQuery] Guid? fournisseur,
        [FromQuery] Guid? projet,
        [FromQuery] PurchaseOrderStatus? statut,
        CancellationToken ct)
    {
        var orders = db.PurchaseOrders.AsNoTracking().AsQueryable();

        if (fournisseur is { } supplierId) orders = orders.Where(o => o.SupplierId == supplierId);
        if (projet is { } projectId) orders = orders.Where(o => o.ProjectId == projectId);
        if (statut is { } status) orders = orders.Where(o => o.Status == status);

        if (!string.IsNullOrWhiteSpace(recherche))
        {
            var term = recherche.Trim().ToLower();

            // The number is matched as text so that typing "14" finds order 14 without having
            // to parse the box and decide what a non-number means.
            orders = orders.Where(o =>
                o.Number.ToString().Contains(term)
                || o.Supplier!.Name.ToLower().Contains(term)
                || (o.Reference != null && o.Reference.ToLower().Contains(term)));
        }

        var totalCount = await orders.CountAsync(ct);

        var items = await orders
            .OrderByDescending(o => o.OrderedOn).ThenByDescending(o => o.Number)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(Projection())
            .ToListAsync(ct);

        return Ok(new PagedResult<PurchaseOrderDto>
        {
            Items = items,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalCount = totalCount
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PurchaseOrderDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.AsNoTracking().Where(o => o.Id == id).Select(Projection()).FirstOrDefaultAsync(ct);
        if (order is null) return NotFound();

        return Ok(new PurchaseOrderDetailDto(order, await LinesAsync(id, ct)));
    }

    /// <summary>What is still owed on this order, for the delivery form to open with.</summary>
    [HttpGet("{id:guid}/restant")]
    public async Task<ActionResult<List<OutstandingLineDto>>> Outstanding(Guid id, CancellationToken ct)
    {
        if (!await db.PurchaseOrders.AnyAsync(o => o.Id == id, ct)) return NotFound();

        var items = await db.PurchaseOrderLines.AsNoTracking()
            .Where(l => l.PurchaseOrderId == id)
            .OrderBy(l => l.SortOrder)
            .Select(l => new OutstandingLineDto(
                l.Id,
                l.Description,
                l.Unit,
                l.Quantity,
                l.ReceiptLines.Sum(r => (decimal?)r.Quantity) ?? 0m,
                // Floored at zero: a supplier who sent a full box has nothing outstanding, and
                // a negative number here would read as a debt the other way round.
                l.Quantity - (l.ReceiptLines.Sum(r => (decimal?)r.Quantity) ?? 0m) > 0
                    ? l.Quantity - (l.ReceiptLines.Sum(r => (decimal?)r.Quantity) ?? 0m)
                    : 0m))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<PurchaseOrderDetailDto>> Create(SavePurchaseOrderRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (await ValidateAsync(request, ct) is { } error) return BadRequest(new { message = error });

        var order = new PurchaseOrder
        {
            TenantId = tenantId,
            Number = await NextNumberAsync(tenantId),
            SupplierId = request.SupplierId,
            ProjectId = request.ProjectId,
            OrderedOn = request.OrderedOn ?? BusinessDay.Today,
            ExpectedOn = request.ExpectedOn,
            Reference = Clean(request.Reference),
            Note = Clean(request.Note),
            Status = PurchaseOrderStatus.Brouillon,
            CreatedByUserId = currentUser.UserId
        };

        db.PurchaseOrders.Add(order);
        ApplyLines(order, tenantId, request.Lines ?? []);

        await db.SaveChangesAsync(ct);
        return await Get(order.Id, ct);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<PurchaseOrderDetailDto>> Update(Guid id, SavePurchaseOrderRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var order = await db.PurchaseOrders.Include(o => o.Lines).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();
        if (await ValidateAsync(request, ct) is { } error) return BadRequest(new { message = error });

        order.SupplierId = request.SupplierId;
        order.ProjectId = request.ProjectId;
        order.OrderedOn = request.OrderedOn ?? order.OrderedOn;
        order.ExpectedOn = request.ExpectedOn;
        order.Reference = Clean(request.Reference);
        order.Note = Clean(request.Note);
        order.UpdatedAt = DateTimeOffset.UtcNow;

        if (request.Lines is { } lines)
        {
            // A line that something was delivered against cannot be dropped: the delivery would
            // be left pointing at nothing, and the yard's count would stop reconciling.
            var kept = lines.Where(l => l.Id is not null).Select(l => l.Id!.Value).ToHashSet();
            var removing = order.Lines.Where(l => !kept.Contains(l.Id)).Select(l => l.Id).ToList();

            if (removing.Count > 0)
            {
                var received = await db.GoodsReceiptLines
                    .Where(r => removing.Contains(r.PurchaseOrderLineId))
                    .Select(r => r.PurchaseOrderLine!.Description)
                    .Distinct()
                    .ToListAsync(ct);

                if (received.Count > 0)
                {
                    return Conflict(new
                    {
                        message = $"Une réception existe pour « {received[0]} ». Supprimez la réception avant de retirer cette ligne."
                    });
                }
            }

            ApplyLines(order, tenantId, lines);
        }

        await db.SaveChangesAsync(ct);
        await RefreshStatusAsync(order, ct);

        return await Get(id, ct);
    }

    /// <summary>
    /// Sends or cancels. The two received states are refused here on purpose: they are a reading
    /// of the deliveries, and a human allowed to set them could tell the system a truck arrived.
    /// </summary>
    [HttpPost("{id:guid}/statut")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<PurchaseOrderDetailDto>> SetStatus(
        Guid id, SetPurchaseOrderStatusRequest request, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();

        if (request.Status is PurchaseOrderStatus.PartiellementRecue or PurchaseOrderStatus.Recue)
        {
            return BadRequest(new { message = "La réception se note en enregistrant une livraison, pas en changeant le statut." });
        }

        if (request.Status == PurchaseOrderStatus.Envoyee && !await db.PurchaseOrderLines.AnyAsync(l => l.PurchaseOrderId == id, ct))
        {
            return BadRequest(new { message = "Une commande sans ligne n'a rien à commander." });
        }

        if (request.Status == PurchaseOrderStatus.Brouillon
            && await db.GoodsReceipts.AnyAsync(r => r.PurchaseOrderId == id, ct))
        {
            return Conflict(new { message = "Du matériel a déjà été reçu sur cette commande." });
        }

        order.Status = request.Status;
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return await Get(id, ct);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();

        var receipts = await db.GoodsReceipts.CountAsync(r => r.PurchaseOrderId == id, ct);
        if (receipts > 0)
        {
            return Conflict(new
            {
                message = receipts == 1
                    ? "Une réception est rattachée à cette commande. Annulez-la plutôt que de la supprimer."
                    : $"{receipts} réceptions sont rattachées à cette commande. Annulez-la plutôt que de la supprimer."
            });
        }

        db.PurchaseOrders.Remove(order);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Helpers ----

    /// <summary>
    /// Reads the deliveries and writes what they say. Called after anything that can change the
    /// arithmetic, so the status is a consequence rather than a claim.
    /// </summary>
    internal static async Task RefreshStatusAsync(VextaDbContext db, Guid orderId, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null) return;

        // A draft is still being written and a cancelled order is closed: neither is something a
        // delivery should quietly reopen.
        if (order.Status is PurchaseOrderStatus.Brouillon or PurchaseOrderStatus.Annulee) return;

        var lines = await db.PurchaseOrderLines.AsNoTracking()
            .Where(l => l.PurchaseOrderId == orderId)
            .Select(l => new
            {
                l.Quantity,
                Received = l.ReceiptLines.Sum(r => (decimal?)r.Quantity) ?? 0m
            })
            .ToListAsync(ct);

        var anything = lines.Any(l => l.Received > 0);
        var everything = lines.Count > 0 && lines.All(l => l.Received >= l.Quantity);

        var status = everything
            ? PurchaseOrderStatus.Recue
            : anything ? PurchaseOrderStatus.PartiellementRecue : PurchaseOrderStatus.Envoyee;

        if (order.Status != status)
        {
            order.Status = status;
            order.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }
    }

    private Task RefreshStatusAsync(PurchaseOrder order, CancellationToken ct) =>
        RefreshStatusAsync(db, order.Id, ct);

    private async Task<List<PurchaseOrderLineDto>> LinesAsync(Guid orderId, CancellationToken ct) =>
        await db.PurchaseOrderLines.AsNoTracking()
            .Where(l => l.PurchaseOrderId == orderId)
            .OrderBy(l => l.SortOrder)
            .Select(l => new PurchaseOrderLineDto(
                l.Id,
                l.ProductId,
                l.Description,
                l.Unit,
                l.Quantity,
                l.UnitCost,
                l.Quantity * l.UnitCost,
                l.ReceiptLines.Sum(r => (decimal?)r.Quantity) ?? 0m,
                l.SortOrder))
            .ToListAsync(ct);

    /// <summary>
    /// Replaces the order's lines with what was sent, keeping the rows whose ids came back so
    /// the deliveries pointing at them stay pointing at them.
    /// </summary>
    private void ApplyLines(PurchaseOrder order, Guid tenantId, IReadOnlyList<SavePurchaseOrderLineRequest> lines)
    {
        var kept = lines.Where(l => l.Id is not null).Select(l => l.Id!.Value).ToHashSet();

        foreach (var gone in order.Lines.Where(l => !kept.Contains(l.Id)).ToList())
        {
            db.PurchaseOrderLines.Remove(gone);
            order.Lines.Remove(gone);
        }

        for (var i = 0; i < lines.Count; i++)
        {
            var sent = lines[i];
            var existing = sent.Id is { } lineId ? order.Lines.FirstOrDefault(l => l.Id == lineId) : null;

            if (existing is null)
            {
                order.Lines.Add(new PurchaseOrderLine
                {
                    TenantId = tenantId,
                    PurchaseOrderId = order.Id,
                    ProductId = sent.ProductId,
                    Description = sent.Description.Trim(),
                    Unit = Clean(sent.Unit),
                    Quantity = sent.Quantity,
                    UnitCost = sent.UnitCost,
                    SortOrder = i
                });
                continue;
            }

            existing.ProductId = sent.ProductId;
            existing.Description = sent.Description.Trim();
            existing.Unit = Clean(sent.Unit);
            existing.Quantity = sent.Quantity;
            existing.UnitCost = sent.UnitCost;
            existing.SortOrder = i;
        }
    }

    /// <summary>
    /// Max + 1, like a project: deleting one must not hand its number to the next, because the
    /// supplier has the old one written on their copy.
    /// </summary>
    private async Task<int> NextNumberAsync(Guid tenantId)
    {
        var highest = await db.PurchaseOrders.IgnoreQueryFilters()
            .Where(o => o.TenantId == tenantId)
            .MaxAsync(o => (int?)o.Number) ?? 0;

        return highest + 1;
    }

    private static System.Linq.Expressions.Expression<Func<PurchaseOrder, PurchaseOrderDto>> Projection() =>
        o => new PurchaseOrderDto(
            o.Id,
            o.Number,
            o.SupplierId,
            o.Supplier!.Name,
            o.ProjectId,
            o.Project != null ? (int?)o.Project.Number : null,
            o.Project != null ? o.Project.Description : null,
            o.Status,
            o.OrderedOn,
            o.ExpectedOn,
            o.Reference,
            o.Note,
            o.Lines.Sum(l => (decimal?)(l.Quantity * l.UnitCost)) ?? 0m,
            o.Lines.Count,
            o.Receipts.Count,
            o.CreatedAt);

    private async Task<string?> ValidateAsync(SavePurchaseOrderRequest r, CancellationToken ct)
    {
        if (!await db.Suppliers.AnyAsync(s => s.Id == r.SupplierId, ct))
        {
            return "Choisissez le fournisseur chez qui la commande est passée.";
        }
        if (r.ProjectId is { } projectId && !await db.Projects.AnyAsync(p => p.Id == projectId, ct))
        {
            return "Ce projet n'existe plus.";
        }

        foreach (var line in r.Lines ?? [])
        {
            if (string.IsNullOrWhiteSpace(line.Description)) return "Chaque ligne a besoin d'une description.";
            if (line.Quantity <= 0) return "La quantité d'une ligne doit être supérieure à zéro.";
            if (line.UnitCost < 0) return "Un coût ne peut pas être négatif.";
            if (line.ProductId is { } productId && !await db.Products.AnyAsync(p => p.Id == productId, ct))
            {
                return "Un des produits choisis n'existe plus.";
            }
        }

        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
