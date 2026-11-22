using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Products;

/// <summary>
/// The company's own way of filing its catalogue: categories, and sub-categories under them.
///
/// Separate from the products because the list is the company's, and it is added to from the
/// dropdown of whichever product is being written — nobody goes to a settings screen first to
/// invent "Plomberie" before they can save the elbow they are holding.
/// </summary>
[ApiController]
[Route("api/product-categories")]
[StaffOnly]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public class ProductCategoriesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProductCategoryDto>>> List(CancellationToken ct)
    {
        var items = await db.ProductCategories.AsNoTracking()
            .OrderBy(c => c.Name)
            .Select(c => new ProductCategoryDto(
                c.Id,
                c.Name,
                c.Products.Count,
                c.SubCategories
                    .OrderBy(s => s.Name)
                    .Select(s => new ProductSubCategoryDto(s.Id, s.CategoryId, s.Name, s.Products.Count))
                    .ToList()))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProductCategoryDto>> Create(SaveCategoryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request.Name) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        // Returned rather than refused: someone typing a category that already exists meant to
        // use that one, and an error here would send them hunting through a list for it.
        var existing = await db.ProductCategories.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Name.ToLower() == name.ToLower(), ct);

        if (existing is not null)
        {
            return Ok(new ProductCategoryDto(existing.Id, existing.Name, 0, []));
        }

        var category = new ProductCategory { TenantId = tenantId, Name = name };
        db.ProductCategories.Add(category);
        await db.SaveChangesAsync(ct);

        return Ok(new ProductCategoryDto(category.Id, category.Name, 0, []));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProductCategoryDto>> Update(
        Guid id, SaveCategoryRequest request, CancellationToken ct)
    {
        var category = await db.ProductCategories.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (category is null) return NotFound();
        if (Problem(request.Name) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        if (await db.ProductCategories.AnyAsync(c => c.Id != id && c.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Une catégorie porte déjà ce nom." });
        }

        category.Name = name;
        await db.SaveChangesAsync(ct);

        return Ok(new ProductCategoryDto(
            category.Id,
            category.Name,
            await db.Products.CountAsync(p => p.CategoryId == id, ct),
            []));
    }

    /// <summary>
    /// Deleting a category is tidying up, not a refusal: the products that used it keep
    /// everything else they have and simply stop being filed anywhere, which is what the
    /// SetNull on their category is for. The sub-categories go with it — they have no meaning
    /// apart from their category.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var category = await db.ProductCategories.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (category is null) return NotFound();

        db.ProductCategories.Remove(category);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{categoryId:guid}/subcategories")]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProductSubCategoryDto>> CreateSubCategory(
        Guid categoryId, SaveCategoryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.ProductCategories.AnyAsync(c => c.Id == categoryId, ct)) return NotFound();
        if (Problem(request.Name) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        // Unique within its category, not across the company: two categories may both have a
        // "Cuivre", and they are not the same sub-category.
        var existing = await db.ProductSubCategories.AsNoTracking()
            .FirstOrDefaultAsync(s => s.CategoryId == categoryId && s.Name.ToLower() == name.ToLower(), ct);

        if (existing is not null)
        {
            return Ok(new ProductSubCategoryDto(existing.Id, existing.CategoryId, existing.Name, 0));
        }

        var subCategory = new ProductSubCategory { TenantId = tenantId, CategoryId = categoryId, Name = name };
        db.ProductSubCategories.Add(subCategory);
        await db.SaveChangesAsync(ct);

        return Ok(new ProductSubCategoryDto(subCategory.Id, subCategory.CategoryId, subCategory.Name, 0));
    }

    [HttpPut("{categoryId:guid}/subcategories/{id:guid}")]
    public async Task<ActionResult<ProductSubCategoryDto>> UpdateSubCategory(
        Guid categoryId, Guid id, SaveCategoryRequest request, CancellationToken ct)
    {
        var subCategory = await db.ProductSubCategories
            .FirstOrDefaultAsync(s => s.Id == id && s.CategoryId == categoryId, ct);
        if (subCategory is null) return NotFound();
        if (Problem(request.Name) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        if (await db.ProductSubCategories.AnyAsync(
                s => s.Id != id && s.CategoryId == categoryId && s.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Une sous-catégorie porte déjà ce nom dans cette catégorie." });
        }

        subCategory.Name = name;
        await db.SaveChangesAsync(ct);

        return Ok(new ProductSubCategoryDto(
            subCategory.Id,
            subCategory.CategoryId,
            subCategory.Name,
            await db.Products.CountAsync(p => p.SubCategoryId == id, ct)));
    }

    [HttpDelete("{categoryId:guid}/subcategories/{id:guid}")]
    public async Task<IActionResult> DeleteSubCategory(Guid categoryId, Guid id, CancellationToken ct)
    {
        var subCategory = await db.ProductSubCategories
            .FirstOrDefaultAsync(s => s.Id == id && s.CategoryId == categoryId, ct);
        if (subCategory is null) return NotFound();

        db.ProductSubCategories.Remove(subCategory);
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
