using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// The materials posted against one project.
///
/// Staff only, including for reading: a material line carries what the company paid for the
/// plywood and the margin it adds, and a customer with access to their own project has no
/// business seeing either. That is the same promise as the expenses, and a different one from
/// the project record, which they do read.
/// </summary>
[ApiController]
[Route("api/projects/{projectId:guid}/materials")]
[StaffOnly]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public class ProjectMaterialsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProjectMaterialDto>>> List(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        var items = await db.ProjectMaterials.AsNoTracking()
            .Where(m => m.ProjectId == projectId)
            .OrderBy(m => m.SortOrder)
            // Tie-broken by creation: two rows can share a rank after an import, and a table
            // that reorders itself between two renders is a table nobody can type into.
            .ThenBy(m => m.CreatedAt)
            .Select(ToDto())
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectMaterialDto>> Create(
        Guid projectId, SaveProjectMaterialRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        if (await UnknownProductAsync(request.ProductId, ct)) return BadRequest(new { message = ProductMissing });

        // Max + 1, not a count: deleting the third of four rows would otherwise hand its rank
        // to the next line added, and two rows sharing a rank is a table that shuffles itself.
        var lastSortOrder = await db.ProjectMaterials
            .Where(m => m.ProjectId == projectId)
            .MaxAsync(m => (int?)m.SortOrder, ct);

        var material = new ProjectMaterial
        {
            TenantId = tenantId,
            ProjectId = projectId,
            ProductId = request.ProductId,
            Code = Clean(request.Code),
            Description = request.Description.Trim(),
            Unit = Clean(request.Unit),
            Quantity = request.Quantity,
            PurchasePrice = request.PurchasePrice,
            MarginPercent = request.MarginPercent,
            UnitPrice = request.UnitPrice,
            SortOrder = (lastSortOrder ?? -1) + 1
        };

        db.ProjectMaterials.Add(material);
        await db.SaveChangesAsync(ct);

        return Ok(Map(material));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProjectMaterialDto>> Update(
        Guid id, SaveProjectMaterialRequest request, CancellationToken ct)
    {
        var material = await db.ProjectMaterials.FirstOrDefaultAsync(m => m.Id == id, ct);
        if (material is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        if (await UnknownProductAsync(request.ProductId, ct)) return BadRequest(new { message = ProductMissing });

        material.ProductId = request.ProductId;
        material.Code = Clean(request.Code);
        material.Description = request.Description.Trim();
        material.Unit = Clean(request.Unit);
        material.Quantity = request.Quantity;
        material.PurchasePrice = request.PurchasePrice;
        material.MarginPercent = request.MarginPercent;
        material.UnitPrice = request.UnitPrice;
        material.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Ok(Map(material));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var material = await db.ProjectMaterials.FirstOrDefaultAsync(m => m.Id == id, ct);
        if (material is null) return NotFound();

        // The ranks of the rows below are left alone: they are only an order, and renumbering
        // three hundred lines to close a gap is work whose result nobody can see.
        db.ProjectMaterials.Remove(material);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private const string ProductMissing = "Ce produit n'existe pas.";

    private static string? Problem(SaveProjectMaterialRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Description)) return "La description est obligatoire.";
        if (request.Description.Trim().Length > 500) return "La description est trop longue.";
        if (request.Code?.Trim().Length > 60) return "Le code est trop long.";
        if (request.Unit?.Trim().Length > 20) return "L'unité est trop longue.";
        if (request.Quantity <= 0) return "La quantité doit être supérieure à zéro.";
        if (request.PurchasePrice is < 0 || request.UnitPrice < 0)
        {
            return "Un prix ne peut pas être négatif.";
        }

        return null;
    }

    /// <summary>
    /// Checks the product against this tenant's own catalogue. The query filter is what makes
    /// another company's id simply not exist here, but an id that points nowhere has to be
    /// refused rather than stored: a line claiming a product nobody can read is a line whose
    /// origin can never be checked again.
    /// </summary>
    private async Task<bool> UnknownProductAsync(Guid? productId, CancellationToken ct)
    {
        if (productId is not { } id) return false;
        return !await db.Products.AnyAsync(p => p.Id == id, ct);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static ProjectMaterialDto Map(ProjectMaterial m) => new(
        m.Id,
        m.ProductId,
        m.Code,
        m.Description,
        m.Unit,
        m.Quantity,
        m.PurchasePrice,
        m.MarginPercent,
        m.UnitPrice,
        m.SortOrder,
        m.CreatedAt,
        m.UpdatedAt);

    private static System.Linq.Expressions.Expression<Func<ProjectMaterial, ProjectMaterialDto>> ToDto() =>
        m => new ProjectMaterialDto(
            m.Id,
            m.ProductId,
            m.Code,
            m.Description,
            m.Unit,
            m.Quantity,
            m.PurchasePrice,
            m.MarginPercent,
            m.UnitPrice,
            m.SortOrder,
            m.CreatedAt,
            m.UpdatedAt);
}
