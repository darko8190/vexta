using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Tenants;

[ApiController]
[Route("api/admin/tenants")]
[Authorize(Roles = nameof(UserRole.SuperAdmin))]
public class TenantsController(VextaDbContext db, UserManager<ApplicationUser> userManager) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<TenantDto>>> List([FromQuery] PagingQuery query)
    {
        var tenants = db.Tenants.IgnoreQueryFilters().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            tenants = tenants.Where(t => t.Name.Contains(query.Search) || t.Slug.Contains(query.Search));
        }

        var totalCount = await tenants.CountAsync();

        var items = await tenants
            .OrderByDescending(t => t.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(t => new TenantDto(
                t.Id, t.Name, t.Slug, t.SubscriptionStatus.ToString(), t.CurrentPeriodEnd, t.CreatedAt,
                db.Users.IgnoreQueryFilters().Count(u => u.TenantId == t.Id),
                db.Clients.IgnoreQueryFilters().Count(c => c.TenantId == t.Id)))
            .ToListAsync();

        return Ok(new PagedResult<TenantDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpPost]
    public async Task<ActionResult<TenantDto>> Create(CreateTenantRequest request)
    {
        var existing = await userManager.FindByEmailAsync(request.AdminEmail.Trim());
        if (existing is not null)
        {
            return Conflict(new { message = "Un compte existe déjà avec ce courriel." });
        }

        var slug = SlugFor(request.CompanyName);
        var suffix = 1;
        while (await db.Tenants.IgnoreQueryFilters().AnyAsync(t => t.Slug == slug))
        {
            slug = $"{SlugFor(request.CompanyName)}-{++suffix}";
        }

        var tenant = new Tenant
        {
            Name = request.CompanyName.Trim(),
            Slug = slug,
            SubscriptionStatus = TenantSubscriptionStatus.Active
        };
        db.Tenants.Add(tenant);

        var user = new ApplicationUser
        {
            UserName = request.AdminEmail.Trim(),
            Email = request.AdminEmail.Trim(),
            FirstName = request.AdminFirstName.Trim(),
            LastName = request.AdminLastName.Trim(),
            Role = UserRole.TenantAdmin,
            TenantId = tenant.Id
        };

        var createResult = await userManager.CreateAsync(user, request.AdminPassword);
        if (!createResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", createResult.Errors.Select(e => e.Description)) });
        }

        await db.SaveChangesAsync();

        return Ok(new TenantDto(tenant.Id, tenant.Name, tenant.Slug, tenant.SubscriptionStatus.ToString(), null, tenant.CreatedAt, 1, 0));
    }

    [HttpPatch("{id:guid}/subscription-status")]
    public async Task<IActionResult> UpdateSubscriptionStatus(Guid id, UpdateTenantSubscriptionRequest request)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id);
        if (tenant is null) return NotFound();

        tenant.SubscriptionStatus = request.Status;
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static string SlugFor(string name)
    {
        var lowered = name.Trim().ToLowerInvariant();
        var cleaned = System.Text.RegularExpressions.Regex.Replace(lowered, "[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(cleaned) ? Guid.NewGuid().ToString("N")[..8] : cleaned;
    }
}
