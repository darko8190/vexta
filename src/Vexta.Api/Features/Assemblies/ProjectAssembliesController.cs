using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Projects;

namespace Vexta.Api.Features.Assemblies;

public record ProjectAssemblyDto(
    Guid Id, Guid ProjectId, Guid? AssemblyId, int? AssemblyNumber, string Name, decimal Quantity,
    decimal UnitCost, decimal UnitPrice, DateOnly? InstalledOn,
    Guid? ProjectTaskId, string? ProjectTaskTitle, DateTimeOffset CreatedAt);

/// <param name="UnitCost">Null takes the assembly's own cost.</param>
/// <param name="UnitPrice">Null takes the assembly's own price.</param>
public record SaveProjectAssemblyRequest(
    Guid? AssemblyId, string? Name, decimal Quantity, decimal? UnitCost, decimal? UnitPrice,
    DateOnly? InstalledOn, Guid? ProjectTaskId);

/// <summary>The assemblies installed on one job. Frozen with the rest of the job once it is billed.</summary>
[ApiController]
[Route("api/projects/{projectId:guid}/assemblages")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ProjectAssembliesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProjectAssemblyDto>>> List(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();
        var items = await db.ProjectAssemblies.AsNoTracking()
            .Where(x => x.ProjectId == projectId)
            .OrderBy(x => x.CreatedAt)
            .Select(ToDto()).ToListAsync(ct);
        if (currentUser.Role == UserRole.TenantUser)
            items = items.ConvertAll(x => x with { UnitCost = 0m, UnitPrice = 0m });
        return Ok(items);
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectAssemblyDto>> Create(Guid projectId, SaveProjectAssemblyRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        var status = await db.Projects.Where(p => p.Id == projectId).Select(p => (ProjectStatus?)p.Status).FirstOrDefaultAsync(ct);
        if (status is null) return NotFound();
        if (ProjectLock.Problem(status.Value) is { } locked) return BadRequest(new { message = locked });
        if (await ProjectTaskLink.ProblemAsync(db, projectId, request.ProjectTaskId, ct) is { } wrongTask)
            return BadRequest(new { message = wrongTask });

        var line = new ProjectAssembly { TenantId = tenantId, ProjectId = projectId, Name = "" };
        if (await ApplyAsync(line, request, ct) is { } problem) return BadRequest(new { message = problem });

        db.ProjectAssemblies.Add(line);
        await AddMaterialsAsync(line, ct);
        await db.SaveChangesAsync(ct);
        return Ok(await db.ProjectAssemblies.AsNoTracking().Where(x => x.Id == line.Id).Select(ToDto()).FirstAsync(ct));
    }

    [HttpPut("{id:guid}")]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectAssemblyDto>> Update(Guid id, SaveProjectAssemblyRequest request, CancellationToken ct)
    {
        var line = await db.ProjectAssemblies.Include(x => x.Project).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (line is null) return NotFound();
        if (line.Project is { } owner && ProjectLock.Problem(owner.Status) is { } locked) return BadRequest(new { message = locked });
        if (await ProjectTaskLink.ProblemAsync(db, line.ProjectId, request.ProjectTaskId, ct) is { } wrongTask)
            return BadRequest(new { message = wrongTask });
        var previousQuantity = line.Quantity;
        var previousAssembly = line.AssemblyId;
        if (await ApplyAsync(line, request, ct) is { } problem) return BadRequest(new { message = problem });

        // The materials follow: another assembly brings its own, another quantity scales them.
        var materials = await db.ProjectMaterials.Where(m => m.ProjectAssemblyId == line.Id).ToListAsync(ct);
        if (previousAssembly != line.AssemblyId)
        {
            db.ProjectMaterials.RemoveRange(materials);
            await AddMaterialsAsync(line, ct);
        }
        else if (previousQuantity != line.Quantity && previousQuantity > 0)
        {
            foreach (var material in materials)
                material.Quantity = Math.Round(material.Quantity / previousQuantity * line.Quantity, 3);
        }

        line.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(await db.ProjectAssemblies.AsNoTracking().Where(x => x.Id == id).Select(ToDto()).FirstAsync(ct));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var line = await db.ProjectAssemblies.Include(x => x.Project).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (line is null) return NotFound();
        if (line.Project is { } owner && ProjectLock.Problem(owner.Status) is { } locked) return BadRequest(new { message = locked });
        db.ProjectAssemblies.Remove(line);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Puts on the job the materials the assembly is made of, so many of each as there are
    /// assemblies, tied to the line. The money stays on the assembly. Does not save.
    /// </summary>
    private async Task AddMaterialsAsync(ProjectAssembly line, CancellationToken ct)
    {
        if (line.AssemblyId is not { } assemblyId) return;
        var assembly = await db.Assemblies.AsNoTracking().Include(a => a.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(a => a.Id == assemblyId, ct);
        if (assembly is null) return;
        var next = await db.ProjectMaterials.Where(m => m.ProjectId == line.ProjectId).MaxAsync(m => (int?)m.SortOrder, ct) ?? -1;
        foreach (var item in assembly.Items.OrderBy(i => i.SortOrder))
        {
            db.ProjectMaterials.Add(new ProjectMaterial
            {
                TenantId = line.TenantId,
                ProjectId = line.ProjectId,
                ProjectAssemblyId = line.Id,
                ProjectTaskId = line.ProjectTaskId,
                ProductId = item.ProductId,
                Code = item.Product?.Code,
                Description = item.Description,
                Unit = item.Unit,
                Quantity = Math.Round(item.Quantity * line.Quantity, 3),
                PurchasePrice = item.PurchasePrice,
                UnitPrice = item.UnitPrice,
                SortOrder = ++next,
            });
        }
    }

    private async Task<string?> ApplyAsync(ProjectAssembly line, SaveProjectAssemblyRequest r, CancellationToken ct)
    {
        if (r.Quantity <= 0) return "La quantité doit être plus grande que zéro.";
        if (r.Quantity > 100_000) return "Cette quantité est sûrement une faute de frappe.";
        if (r.UnitCost is < 0 || r.UnitPrice is < 0) return "Un prix ne peut pas être négatif.";

        Assembly? assembly = null;
        if (r.AssemblyId is { } assemblyId)
        {
            assembly = await db.Assemblies.AsNoTracking().Include(a => a.Items).FirstOrDefaultAsync(a => a.Id == assemblyId, ct);
            if (assembly is null) return "Cet assemblage n'existe plus.";
        }

        var name = string.IsNullOrWhiteSpace(r.Name) ? assembly?.Name : r.Name.Trim();
        if (string.IsNullOrWhiteSpace(name)) return "Choisissez un assemblage ou donnez un nom à la ligne.";
        if (name.Length > 200) return "Le nom est trop long.";

        // A different assembly picked: its own figures, unless the request names others.
        var switched = line.AssemblyId != r.AssemblyId;
        line.AssemblyId = r.AssemblyId;
        line.Name = name;
        line.Quantity = r.Quantity;
        line.UnitCost = r.UnitCost ?? (assembly is not null && (switched || line.UnitCost == 0) ? AssembliesController.CostOf(assembly.Items) : line.UnitCost);
        line.UnitPrice = r.UnitPrice ?? (assembly is not null && (switched || line.UnitPrice == 0) ? AssembliesController.PriceOf(assembly.Items) : line.UnitPrice);
        line.InstalledOn = r.InstalledOn;
        line.ProjectTaskId = r.ProjectTaskId;
        return null;
    }

    private static System.Linq.Expressions.Expression<Func<ProjectAssembly, ProjectAssemblyDto>> ToDto() => x =>
        new ProjectAssemblyDto(
            x.Id, x.ProjectId, x.AssemblyId, x.Assembly == null ? null : x.Assembly.Number, x.Name, x.Quantity,
            x.UnitCost, x.UnitPrice, x.InstalledOn, x.ProjectTaskId, x.ProjectTask == null ? null : x.ProjectTask.Title,
            x.CreatedAt);
}
