using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Equipment;

public record EquipmentDto(
    Guid Id, int Number, string Name, string? Description, string? SerialNumber,
    EquipmentUnit Unit, decimal? CostRate, decimal? SellingRate, EquipmentStatus Status,
    bool IsRented, string? Notes,
    /// <summary>How many job lines use it, and its total use, for the list.</summary>
    int ProjectCount, decimal TotalQuantity,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public record SaveEquipmentRequest(
    string Name, string? Description, string? SerialNumber, EquipmentUnit Unit,
    decimal? CostRate, decimal? SellingRate, EquipmentStatus Status, bool IsRented, string? Notes);

/// <summary>The company's equipment: what it has to put on a job, and at what rates.</summary>
[ApiController]
[Route("api/equipements")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class EquipmentController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<EquipmentDto>>> List([FromQuery] PagingQuery query, CancellationToken ct)
    {
        var items = db.Equipment.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = $"%{query.Search.Trim()}%";
            items = items.Where(e => EF.Functions.ILike(e.Name, pattern)
                || (e.SerialNumber != null && EF.Functions.ILike(e.SerialNumber, pattern)));
        }

        var total = await items.CountAsync(ct);
        var page = await items.OrderBy(e => e.Name)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(ToDto()).ToListAsync(ct);
        return Ok(new PagedResult<EquipmentDto> { Items = page, Page = query.Page, PageSize = query.PageSize, TotalCount = total });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<EquipmentDto>> Get(Guid id, CancellationToken ct) =>
        await db.Equipment.AsNoTracking().Where(e => e.Id == id).Select(ToDto()).FirstOrDefaultAsync(ct) is { } dto
            ? Ok(dto) : NotFound();

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<EquipmentDto>> Create(SaveEquipmentRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var number = (await db.Equipment.IgnoreQueryFilters().Where(e => e.TenantId == tenantId)
            .MaxAsync(e => (int?)e.Number, ct) ?? 0) + 1;
        var equipment = new Domain.Equipment { TenantId = tenantId, Number = number, Name = request.Name.Trim() };
        Apply(equipment, request);
        db.Equipment.Add(equipment);
        await db.SaveChangesAsync(ct);
        return await Get(equipment.Id, ct);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<EquipmentDto>> Update(Guid id, SaveEquipmentRequest request, CancellationToken ct)
    {
        var equipment = await db.Equipment.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (equipment is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        Apply(equipment, request);
        equipment.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return await Get(id, ct);
    }

    /// <summary>Its lines on past jobs stay, with the name they were made under.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var equipment = await db.Equipment.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (equipment is null) return NotFound();
        db.Equipment.Remove(equipment);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static void Apply(Domain.Equipment e, SaveEquipmentRequest r)
    {
        e.Name = r.Name.Trim();
        e.Description = Clean(r.Description);
        e.SerialNumber = Clean(r.SerialNumber);
        e.Unit = r.Unit;
        e.CostRate = r.CostRate;
        e.SellingRate = r.SellingRate;
        e.Status = r.Status;
        e.IsRented = r.IsRented;
        e.Notes = Clean(r.Notes);
    }

    private static string? Problem(SaveEquipmentRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return "L'équipement a besoin d'un nom.";
        if (r.Name.Trim().Length > 200) return "Le nom est trop long.";
        if (r.SerialNumber is { Length: > 100 }) return "Le numéro de série est trop long.";
        if (r.CostRate is < 0 || r.SellingRate is < 0) return "Un taux ne peut pas être négatif.";
        if (!Enum.IsDefined(r.Unit) || !Enum.IsDefined(r.Status)) return "Unité ou état inconnu.";
        return null;
    }

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    private System.Linq.Expressions.Expression<Func<Domain.Equipment, EquipmentDto>> ToDto() => e => new EquipmentDto(
        e.Id, e.Number, e.Name, e.Description, e.SerialNumber, e.Unit, e.CostRate, e.SellingRate, e.Status,
        e.IsRented, e.Notes,
        db.ProjectEquipment.Where(u => u.EquipmentId == e.Id).Select(u => u.ProjectId).Distinct().Count(),
        db.ProjectEquipment.Where(u => u.EquipmentId == e.Id).Sum(u => (decimal?)u.Quantity) ?? 0,
        e.CreatedAt, e.UpdatedAt);
}
