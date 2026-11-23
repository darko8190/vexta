using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Purchasing;

/// <summary>
/// Who the company buys from.
///
/// Readable by anyone on staff, because somebody picking up material needs the phone number;
/// written by the people who run the business, because the account number on this card is what
/// purchases get charged against.
/// </summary>
[ApiController]
[Route("api/fournisseurs")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class SuppliersController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <param name="recherche">Matches the name, the contact, or the account number.</param>
    /// <param name="inactifs">True also returns the ones that have been put aside.</param>
    [HttpGet]
    public async Task<ActionResult<List<SupplierDto>>> List(
        [FromQuery] string? recherche, [FromQuery] bool inactifs, CancellationToken ct)
    {
        var query = db.Suppliers.AsNoTracking().AsQueryable();

        if (!inactifs) query = query.Where(s => s.IsActive);

        if (!string.IsNullOrWhiteSpace(recherche))
        {
            var term = recherche.Trim().ToLower();
            query = query.Where(s =>
                s.Name.ToLower().Contains(term)
                || (s.ContactName != null && s.ContactName.ToLower().Contains(term))
                || (s.AccountNumber != null && s.AccountNumber.ToLower().Contains(term)));
        }

        var items = await query.OrderBy(s => s.Name).Select(Projection()).ToListAsync(ct);
        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SupplierDto>> Get(Guid id, CancellationToken ct)
    {
        var supplier = await db.Suppliers.AsNoTracking().Where(s => s.Id == id).Select(Projection()).FirstOrDefaultAsync(ct);
        return supplier is null ? NotFound() : Ok(supplier);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<SupplierDto>> Create(SaveSupplierRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Validate(request) is { } error) return BadRequest(new { message = error });

        var name = request.Name.Trim();

        // Refused rather than merged: two suppliers with the same name are usually two branches
        // of the same yard, and the person adding the second one has to say which it is.
        if (await db.Suppliers.AnyAsync(s => s.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Un fournisseur porte déjà ce nom." });
        }

        var supplier = new Supplier
        {
            TenantId = tenantId,
            Name = name,
            ContactName = Clean(request.ContactName),
            Email = Clean(request.Email),
            Phone = Clean(request.Phone),
            Website = Clean(request.Website),
            AccountNumber = Clean(request.AccountNumber),
            Line1 = Clean(request.Line1),
            City = Clean(request.City),
            Province = Clean(request.Province),
            PostalCode = Clean(request.PostalCode),
            Notes = Clean(request.Notes),
            IsActive = request.IsActive
        };

        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync(ct);

        return Ok(await DtoAsync(supplier.Id, ct));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<SupplierDto>> Update(Guid id, SaveSupplierRequest request, CancellationToken ct)
    {
        var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (supplier is null) return NotFound();
        if (Validate(request) is { } error) return BadRequest(new { message = error });

        var name = request.Name.Trim();
        if (await db.Suppliers.AnyAsync(s => s.Id != id && s.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Un fournisseur porte déjà ce nom." });
        }

        supplier.Name = name;
        supplier.ContactName = Clean(request.ContactName);
        supplier.Email = Clean(request.Email);
        supplier.Phone = Clean(request.Phone);
        supplier.Website = Clean(request.Website);
        supplier.AccountNumber = Clean(request.AccountNumber);
        supplier.Line1 = Clean(request.Line1);
        supplier.City = Clean(request.City);
        supplier.Province = Clean(request.Province);
        supplier.PostalCode = Clean(request.PostalCode);
        supplier.Notes = Clean(request.Notes);
        supplier.IsActive = request.IsActive;
        supplier.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(await DtoAsync(id, ct));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (supplier is null) return NotFound();

        // Refused with the count, and the message says what to do instead: the orders are the
        // record of money that left, and they have to keep saying where it went.
        var orders = await db.PurchaseOrders.CountAsync(o => o.SupplierId == id, ct);
        if (orders > 0)
        {
            return Conflict(new
            {
                message = orders == 1
                    ? "Une commande est rattachée à ce fournisseur. Rendez-le inactif plutôt que de le supprimer."
                    : $"{orders} commandes sont rattachées à ce fournisseur. Rendez-le inactif plutôt que de le supprimer."
            });
        }

        db.Suppliers.Remove(supplier);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Helpers ----

    private async Task<SupplierDto> DtoAsync(Guid id, CancellationToken ct) =>
        await db.Suppliers.AsNoTracking().Where(s => s.Id == id).Select(Projection()).FirstAsync(ct);

    private static System.Linq.Expressions.Expression<Func<Supplier, SupplierDto>> Projection() =>
        s => new SupplierDto(
            s.Id,
            s.Name,
            s.ContactName,
            s.Email,
            s.Phone,
            s.Website,
            s.AccountNumber,
            s.Line1,
            s.City,
            s.Province,
            s.PostalCode,
            s.Notes,
            s.IsActive,
            s.Orders.Count,
            s.Orders.Count(o => o.Status == PurchaseOrderStatus.Envoyee
                             || o.Status == PurchaseOrderStatus.PartiellementRecue));

    private static string? Validate(SaveSupplierRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return "Le nom du fournisseur est obligatoire.";
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
