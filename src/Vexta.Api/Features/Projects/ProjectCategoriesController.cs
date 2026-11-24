using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;
using Vexta.Api.Features.Products;

namespace Vexta.Api.Features.Projects;

public record ProjectCategoryDto(
    Guid Id,
    string Name,
    int ProjectCount,
    IReadOnlyList<ProjectSubCategoryDto> SubCategories);

public record ProjectSubCategoryDto(Guid Id, Guid CategoryId, string Name, int ProjectCount);

/// <summary>
/// The company's own way of filing its jobs: categories, and sub-categories under them.
///
/// The same shape as the catalogue's categories and the same reasoning: the list is added to
/// from the dropdown of whichever project is being written. A separate list, though — a
/// company files its jobs and its products by different things.
/// </summary>
[ApiController]
[Route("api/project-categories")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ProjectCategoriesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProjectCategoryDto>>> List(CancellationToken ct)
    {
        var items = await db.ProjectCategories.AsNoTracking()
            .OrderBy(c => c.Name)
            .Select(c => new ProjectCategoryDto(
                c.Id,
                c.Name,
                c.Projects.Count,
                c.SubCategories
                    .OrderBy(s => s.Name)
                    .Select(s => new ProjectSubCategoryDto(s.Id, s.CategoryId, s.Name, s.Projects.Count))
                    .ToList()))
            .ToListAsync(ct);

        return Ok(items);
    }

    [Authorize(Roles = Roles.Managers)]
    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectCategoryDto>> Create(SaveCategoryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request.Name) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        // Returned rather than refused: someone typing a category that already exists meant to
        // use that one.
        var existing = await db.ProjectCategories.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Name.ToLower() == name.ToLower(), ct);

        if (existing is not null)
        {
            return Ok(new ProjectCategoryDto(existing.Id, existing.Name, 0, []));
        }

        var category = new ProjectCategory { TenantId = tenantId, Name = name };
        db.ProjectCategories.Add(category);
        await db.SaveChangesAsync(ct);

        return Ok(new ProjectCategoryDto(category.Id, category.Name, 0, []));
    }

    [Authorize(Roles = Roles.Managers)]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProjectCategoryDto>> Update(
        Guid id, SaveCategoryRequest request, CancellationToken ct)
    {
        var category = await db.ProjectCategories.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (category is null) return NotFound();
        if (Problem(request.Name) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        if (await db.ProjectCategories.AnyAsync(c => c.Id != id && c.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Une catégorie porte déjà ce nom." });
        }

        category.Name = name;
        await db.SaveChangesAsync(ct);

        return Ok(new ProjectCategoryDto(
            category.Id,
            category.Name,
            await db.Projects.CountAsync(p => p.CategoryId == id, ct),
            []));
    }

    /// <summary>
    /// Deleting a category is tidying up, not a refusal: the jobs filed there keep everything
    /// else and simply stop being filed anywhere, which is what the SetNull on the project is
    /// for. The sub-categories go with it.
    /// </summary>
    [Authorize(Roles = Roles.Managers)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var category = await db.ProjectCategories.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (category is null) return NotFound();

        db.ProjectCategories.Remove(category);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [Authorize(Roles = Roles.Managers)]
    [HttpPost("{categoryId:guid}/subcategories")]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectSubCategoryDto>> CreateSubCategory(
        Guid categoryId, SaveCategoryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.ProjectCategories.AnyAsync(c => c.Id == categoryId, ct)) return NotFound();
        if (Problem(request.Name) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        // Unique within its category, not across the company: two categories may both have a
        // "Cuivre", and they are not the same sub-category.
        var existing = await db.ProjectSubCategories.AsNoTracking()
            .FirstOrDefaultAsync(s => s.CategoryId == categoryId && s.Name.ToLower() == name.ToLower(), ct);

        if (existing is not null)
        {
            return Ok(new ProjectSubCategoryDto(existing.Id, existing.CategoryId, existing.Name, 0));
        }

        var subCategory = new ProjectSubCategory { TenantId = tenantId, CategoryId = categoryId, Name = name };
        db.ProjectSubCategories.Add(subCategory);
        await db.SaveChangesAsync(ct);

        return Ok(new ProjectSubCategoryDto(subCategory.Id, subCategory.CategoryId, subCategory.Name, 0));
    }

    [Authorize(Roles = Roles.Managers)]
    [HttpPut("{categoryId:guid}/subcategories/{id:guid}")]
    public async Task<ActionResult<ProjectSubCategoryDto>> UpdateSubCategory(
        Guid categoryId, Guid id, SaveCategoryRequest request, CancellationToken ct)
    {
        var subCategory = await db.ProjectSubCategories
            .FirstOrDefaultAsync(s => s.Id == id && s.CategoryId == categoryId, ct);
        if (subCategory is null) return NotFound();
        if (Problem(request.Name) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        if (await db.ProjectSubCategories.AnyAsync(
                s => s.Id != id && s.CategoryId == categoryId && s.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Une sous-catégorie porte déjà ce nom dans cette catégorie." });
        }

        subCategory.Name = name;
        await db.SaveChangesAsync(ct);

        return Ok(new ProjectSubCategoryDto(
            subCategory.Id,
            subCategory.CategoryId,
            subCategory.Name,
            await db.Projects.CountAsync(p => p.SubCategoryId == id, ct)));
    }

    [Authorize(Roles = Roles.Managers)]
    [HttpDelete("{categoryId:guid}/subcategories/{id:guid}")]
    public async Task<IActionResult> DeleteSubCategory(Guid categoryId, Guid id, CancellationToken ct)
    {
        var subCategory = await db.ProjectSubCategories
            .FirstOrDefaultAsync(s => s.Id == id && s.CategoryId == categoryId, ct);
        if (subCategory is null) return NotFound();

        db.ProjectSubCategories.Remove(subCategory);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Problem(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Le nom est obligatoire.";
        if (name.Trim().Length > 100) return "Le nom est trop long.";
        return null;
    }
}
