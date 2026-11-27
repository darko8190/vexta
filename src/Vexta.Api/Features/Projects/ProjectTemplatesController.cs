using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

public record ProjectTemplateDto(
    Guid Id, string Name, string? Description, int LineCount, decimal Subtotal, DateTimeOffset UpdatedAt);

public record ProjectTemplateLineDto(
    Guid Id, ProjectTemplateLineKind Kind, string Description, string? Unit, decimal Quantity, decimal? UnitCost, decimal UnitPrice);

public record ProjectTemplateDetailDto(ProjectTemplateDto Template, List<ProjectTemplateLineDto> Lines);

public record SaveProjectTemplateRequest(string Name);

/// <summary>
/// Project templates: a kind of job kept to start new projects from. Made from a project
/// (POST projects/{id}/modele), used when creating one (TemplateId on the create request).
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
[RequireActiveSubscription]
public class ProjectTemplatesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet("api/modeles-projet")]
    public async Task<ActionResult<List<ProjectTemplateDto>>> List(CancellationToken ct) =>
        Ok(await db.ProjectTemplates.AsNoTracking().OrderBy(t => t.Name).Select(ToDto()).ToListAsync(ct));

    [HttpGet("api/modeles-projet/{id:guid}")]
    public async Task<ActionResult<ProjectTemplateDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var template = await db.ProjectTemplates.AsNoTracking().Where(t => t.Id == id).Select(ToDto()).FirstOrDefaultAsync(ct);
        if (template is null) return NotFound();
        var lines = await db.ProjectTemplateLines.AsNoTracking()
            .Where(l => l.TemplateId == id)
            .OrderBy(l => l.Kind).ThenBy(l => l.SortOrder)
            .Select(l => new ProjectTemplateLineDto(l.Id, l.Kind, l.Description, l.Unit, l.Quantity, l.UnitCost, l.UnitPrice))
            .ToListAsync(ct);
        return Ok(new ProjectTemplateDetailDto(template, lines));
    }

    [HttpDelete("api/modeles-projet/{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var template = await db.ProjectTemplates.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (template is null) return NotFound();
        db.ProjectTemplates.Remove(template);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// The job's description, tasks, materials, equipment, assemblies and extra charges, kept
    /// under a name. A template of the same name is replaced. An assembly's materials are not
    /// kept: they come from the assembly when the template is used.
    /// </summary>
    [HttpPost("api/projects/{projectId:guid}/modele")]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectTemplateDto>> SaveFromProject(Guid projectId, SaveProjectTemplateRequest request, CancellationToken ct)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name)) return BadRequest(new { message = "Donnez un nom au modèle." });
        if (name.Length > 200) return BadRequest(new { message = "Le nom est limité à 200 caractères." });
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var project = await db.Projects.AsNoTracking()
            .Include(p => p.Tasks).Include(p => p.Materials).Include(p => p.EquipmentUsed).Include(p => p.ExtraCharges)
            .FirstOrDefaultAsync(p => p.Id == projectId, ct);
        if (project is null) return NotFound();
        var assemblies = await db.ProjectAssemblies.AsNoTracking().Where(a => a.ProjectId == projectId).OrderBy(a => a.CreatedAt).ToListAsync(ct);

        var template = await db.ProjectTemplates.Include(t => t.Lines).FirstOrDefaultAsync(t => t.Name.ToLower() == name.ToLower(), ct);
        if (template is null)
        {
            template = new ProjectTemplate { TenantId = tenantId, Name = name };
            db.ProjectTemplates.Add(template);
        }
        else
        {
            db.ProjectTemplateLines.RemoveRange(template.Lines);
        }
        template.Name = name;
        template.Description = project.Description;
        template.CategoryId = project.CategoryId;
        template.SubCategoryId = project.SubCategoryId;
        template.UpdatedAt = DateTimeOffset.UtcNow;

        var order = 0;
        void Add(ProjectTemplateLineKind kind, string description, decimal quantity, decimal? cost, decimal price,
            Guid? productId = null, Guid? equipmentId = null, Guid? assemblyId = null, string? code = null, string? unit = null) =>
            db.ProjectTemplateLines.Add(new ProjectTemplateLine
            {
                TenantId = tenantId, TemplateId = template.Id, Kind = kind, Description = description,
                Quantity = quantity, UnitCost = cost, UnitPrice = price, ProductId = productId,
                EquipmentId = equipmentId, AssemblyId = assemblyId, Code = code, Unit = unit, SortOrder = order++
            });

        foreach (var t in project.Tasks.OrderBy(t => t.SortOrder))
            Add(ProjectTemplateLineKind.Tache, t.Title, t.EstimatedHours ?? 0m, null, 0m);
        foreach (var m in project.Materials.Where(m => m.ProjectAssemblyId == null).OrderBy(m => m.SortOrder))
            Add(ProjectTemplateLineKind.Materiel, m.Description, m.Quantity, m.PurchasePrice, m.UnitPrice, productId: m.ProductId, code: m.Code, unit: m.Unit);
        foreach (var e in project.EquipmentUsed.OrderBy(e => e.CreatedAt))
            Add(ProjectTemplateLineKind.Equipement, e.Name, e.Quantity, e.CostRate, e.SellingRate ?? 0m, equipmentId: e.EquipmentId, unit: ((int)e.Unit).ToString());
        foreach (var a in assemblies)
            Add(ProjectTemplateLineKind.Assemblage, a.Name, a.Quantity, a.UnitCost, a.UnitPrice, assemblyId: a.AssemblyId);
        foreach (var x in project.ExtraCharges.OrderBy(x => x.CreatedAt))
            Add(ProjectTemplateLineKind.Frais, x.Name, 1m, x.Cost, x.SellingPrice ?? 0m);

        await db.SaveChangesAsync(ct);
        return Ok(await db.ProjectTemplates.AsNoTracking().Where(t => t.Id == template.Id).Select(ToDto()).FirstAsync(ct));
    }

    /// <summary>Puts a template's lines on a project being created. Does not save.</summary>
    internal static async Task<string?> ApplyAsync(VextaDbContext db, Project project, Guid templateId, CancellationToken ct)
    {
        var template = await db.ProjectTemplates.AsNoTracking().Include(t => t.Lines).FirstOrDefaultAsync(t => t.Id == templateId, ct);
        if (template is null) return "Ce modèle n'existe plus.";

        if (string.IsNullOrWhiteSpace(project.Description)) project.Description = template.Description;
        project.CategoryId ??= template.CategoryId;
        if (project.CategoryId == template.CategoryId) project.SubCategoryId ??= template.SubCategoryId;

        var assemblyIds = template.Lines.Where(l => l.AssemblyId != null).Select(l => l.AssemblyId!.Value).Distinct().ToList();
        var assemblies = await db.Assemblies.AsNoTracking().Include(a => a.Items).ThenInclude(i => i.Product)
            .Where(a => assemblyIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);

        var order = 0;
        foreach (var l in template.Lines.OrderBy(l => l.Kind).ThenBy(l => l.SortOrder))
        {
            switch (l.Kind)
            {
                case ProjectTemplateLineKind.Tache:
                    project.Tasks.Add(new ProjectTask
                    {
                        TenantId = project.TenantId, Title = l.Description.Length > 200 ? l.Description[..200] : l.Description,
                        EstimatedHours = l.Quantity > 0 ? l.Quantity : null, SortOrder = order++
                    });
                    break;
                case ProjectTemplateLineKind.Materiel:
                    project.Materials.Add(new ProjectMaterial
                    {
                        TenantId = project.TenantId, ProductId = l.ProductId, Code = l.Code, Description = l.Description,
                        Unit = l.Unit, Quantity = l.Quantity, PurchasePrice = l.UnitCost, UnitPrice = l.UnitPrice, SortOrder = order++
                    });
                    break;
                case ProjectTemplateLineKind.Equipement:
                    project.EquipmentUsed.Add(new ProjectEquipment
                    {
                        TenantId = project.TenantId, EquipmentId = l.EquipmentId, Name = l.Description,
                        Unit = int.TryParse(l.Unit, out var unit) && Enum.IsDefined(typeof(EquipmentUnit), unit) ? (EquipmentUnit)unit : EquipmentUnit.Heure,
                        Quantity = l.Quantity, CostRate = l.UnitCost, SellingRate = l.UnitPrice
                    });
                    break;
                case ProjectTemplateLineKind.Assemblage:
                    var line = new ProjectAssembly
                    {
                        TenantId = project.TenantId, ProjectId = project.Id, AssemblyId = l.AssemblyId, Name = l.Description,
                        Quantity = l.Quantity, UnitCost = l.UnitCost ?? 0m, UnitPrice = l.UnitPrice
                    };
                    db.ProjectAssemblies.Add(line);
                    if (l.AssemblyId is { } aid && assemblies.TryGetValue(aid, out var assembly))
                    {
                        foreach (var item in assembly.Items.OrderBy(i => i.SortOrder))
                        {
                            project.Materials.Add(new ProjectMaterial
                            {
                                TenantId = project.TenantId, ProjectAssemblyId = line.Id, ProductId = item.ProductId,
                                Code = item.Product?.Code, Description = item.Description, Unit = item.Unit,
                                Quantity = Math.Round(item.Quantity * l.Quantity, 3), PurchasePrice = item.PurchasePrice,
                                UnitPrice = item.UnitPrice, SortOrder = order++
                            });
                        }
                    }
                    break;
                case ProjectTemplateLineKind.Frais:
                    project.ExtraCharges.Add(new ProjectExtraCharge
                    {
                        TenantId = project.TenantId, Name = l.Description.Length > 200 ? l.Description[..200] : l.Description,
                        Cost = l.UnitCost, SellingPrice = l.UnitPrice
                    });
                    break;
            }
        }
        return null;
    }

    private static System.Linq.Expressions.Expression<Func<ProjectTemplate, ProjectTemplateDto>> ToDto() => t =>
        new ProjectTemplateDto(
            t.Id, t.Name, t.Description, t.Lines.Count,
            t.Lines.Where(l => l.Kind != ProjectTemplateLineKind.Tache).Sum(l => Math.Round(l.Quantity * l.UnitPrice, 2)),
            t.UpdatedAt);
}
