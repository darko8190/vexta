using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Assemblies;

public record AssemblyItemDto(
    Guid Id, Guid? ProductId, string Description, string? Unit, decimal Quantity, decimal? PurchasePrice, decimal UnitPrice);

public record AssemblyDto(
    Guid Id, int Number, string Name, string? Description,
    /// <summary>What one of it costs and sells for: the sums of its items.</summary>
    decimal UnitCost, decimal UnitPrice, int ItemCount, int ProjectCount,
    IReadOnlyList<AssemblyItemDto> Items, DateTimeOffset UpdatedAt);

public record SaveAssemblyItemRequest(
    Guid? ProductId, string Description, string? Unit, decimal Quantity, decimal? PurchasePrice, decimal UnitPrice);

public record SaveAssemblyRequest(string Name, string? Description, IReadOnlyList<SaveAssemblyItemRequest> Items);

/// <summary>The company's assemblies: sets prepared in advance and installed as one.</summary>
[ApiController]
[Route("api/assemblages")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class AssembliesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<AssemblyDto>>> List([FromQuery] string? search, CancellationToken ct)
    {
        var query = db.Assemblies.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{search.Trim()}%";
            query = query.Where(a => EF.Functions.ILike(a.Name, pattern)
                || (a.Description != null && EF.Functions.ILike(a.Description, pattern)));
        }

        var rows = await query.OrderByDescending(a => a.Number).Include(a => a.Items).ToListAsync(ct);
        var ids = rows.Select(a => a.Id).ToList();
        var usage = await db.ProjectAssemblies.AsNoTracking()
            .Where(p => p.AssemblyId != null && ids.Contains(p.AssemblyId.Value))
            .GroupBy(p => p.AssemblyId!.Value)
            .Select(g => new { g.Key, Count = g.Select(x => x.ProjectId).Distinct().Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        return Ok(rows.Select(a => ToDto(a, usage.GetValueOrDefault(a.Id))).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<AssemblyDto>> Get(Guid id, CancellationToken ct)
    {
        var assembly = await db.Assemblies.AsNoTracking().Include(a => a.Items).FirstOrDefaultAsync(a => a.Id == id, ct);
        if (assembly is null) return NotFound();
        var count = await db.ProjectAssemblies.Where(p => p.AssemblyId == id).Select(p => p.ProjectId).Distinct().CountAsync(ct);
        return Ok(ToDto(assembly, count));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<AssemblyDto>> Create(SaveAssemblyRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var number = (await db.Assemblies.IgnoreQueryFilters().Where(a => a.TenantId == tenantId)
            .MaxAsync(a => (int?)a.Number, ct) ?? 0) + 1;
        var assembly = new Assembly { TenantId = tenantId, Number = number, Name = request.Name.Trim() };
        Apply(assembly, request);
        db.Assemblies.Add(assembly);
        await db.SaveChangesAsync(ct);
        return await Get(assembly.Id, ct);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<AssemblyDto>> Update(Guid id, SaveAssemblyRequest request, CancellationToken ct)
    {
        var assembly = await db.Assemblies.Include(a => a.Items).FirstOrDefaultAsync(a => a.Id == id, ct);
        if (assembly is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        db.AssemblyItems.RemoveRange(assembly.Items);
        assembly.Items.Clear();
        Apply(assembly, request);
        foreach (var item in assembly.Items) db.AssemblyItems.Add(item);
        assembly.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return await Get(id, ct);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var assembly = await db.Assemblies.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (assembly is null) return NotFound();
        db.Assemblies.Remove(assembly);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Problem(SaveAssemblyRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Le nom de l'assemblage est obligatoire.";
        if (request.Name.Trim().Length > 200) return "Le nom est trop long.";
        if (request.Description is { Length: > 2000 }) return "La description est trop longue.";
        if (request.Items is null || request.Items.Count == 0) return "Ajoutez au moins un élément à l'assemblage.";
        if (request.Items.Count > 200) return "Trop d'éléments dans un seul assemblage.";
        foreach (var item in request.Items)
        {
            if (string.IsNullOrWhiteSpace(item.Description)) return "Chaque élément a besoin d'une description.";
            if (item.Quantity <= 0) return "La quantité d'un élément doit être plus grande que zéro.";
            if (item.UnitPrice < 0 || item.PurchasePrice is < 0) return "Un prix ne peut pas être négatif.";
        }
        return null;
    }

    private static void Apply(Assembly assembly, SaveAssemblyRequest request)
    {
        assembly.Name = request.Name.Trim();
        assembly.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        assembly.Items = [.. request.Items.Select((item, index) => new AssemblyItem
        {
            AssemblyId = assembly.Id,
            ProductId = item.ProductId,
            Description = item.Description.Trim(),
            Unit = string.IsNullOrWhiteSpace(item.Unit) ? null : item.Unit.Trim(),
            Quantity = item.Quantity,
            PurchasePrice = item.PurchasePrice,
            UnitPrice = item.UnitPrice,
            SortOrder = index,
        })];
    }

    public static decimal CostOf(IEnumerable<AssemblyItem> items) =>
        Math.Round(items.Sum(i => i.Quantity * (i.PurchasePrice ?? 0m)), 2, MidpointRounding.AwayFromZero);

    public static decimal PriceOf(IEnumerable<AssemblyItem> items) =>
        Math.Round(items.Sum(i => i.Quantity * i.UnitPrice), 2, MidpointRounding.AwayFromZero);

    private static AssemblyDto ToDto(Assembly a, int projectCount) =>
        new(a.Id, a.Number, a.Name, a.Description, CostOf(a.Items), PriceOf(a.Items), a.Items.Count, projectCount,
            [.. a.Items.OrderBy(i => i.SortOrder).Select(i =>
                new AssemblyItemDto(i.Id, i.ProductId, i.Description, i.Unit, i.Quantity, i.PurchasePrice, i.UnitPrice))],
            a.UpdatedAt);
}
