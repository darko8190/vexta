using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Auth;

namespace Vexta.Api.Features.Tenants;

[ApiController]
[Route("api/admin/tenants")]
[Authorize(Roles = nameof(UserRole.SuperAdmin))]
public class TenantsController(
    VextaDbContext db,
    UserManager<ApplicationUser> userManager,
    ITokenService tokenService,
    ICurrentUserService currentUser) : ControllerBase
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
                t.Id, t.Name, t.Slug, t.Kind.ToString(), t.SubscriptionStatus.ToString(), t.CurrentPeriodEnd, t.CreatedAt,
                db.Users.IgnoreQueryFilters().Count(u => u.TenantId == t.Id),
                db.Clients.IgnoreQueryFilters().Count(c => c.TenantId == t.Id),
                t.PlanId,
                t.Plan!.Name,
                t.PlanId == null ? 1 : t.Plan!.MaxUsers))
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

        return Ok(new TenantDto(tenant.Id, tenant.Name, tenant.Slug, tenant.Kind.ToString(), tenant.SubscriptionStatus.ToString(), null, tenant.CreatedAt, 1, 0, null, null, 1));
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

    /// <summary>
    /// Assigns the plan a hand-created tenant never got. Without this the space stays capped at
    /// one seat forever, because the seat limit is the plan's and there is no plan.
    /// </summary>
    [HttpPatch("{id:guid}/plan")]
    public async Task<IActionResult> UpdatePlan(Guid id, UpdateTenantPlanRequest request, CancellationToken ct)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (tenant is null) return NotFound();

        if (request.PlanId is { } planId)
        {
            if (!await db.Plans.AnyAsync(p => p.Id == planId, ct))
            {
                return BadRequest(new { message = "Ce forfait n'existe pas." });
            }

            // Nothing here touches Stripe: the subscription, if any, keeps charging what it
            // charges. This sets what the space is allowed to do, not what it pays.
            tenant.PlanId = planId;
        }
        else
        {
            tenant.PlanId = null;
        }

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/impersonate")]
    public async Task<ActionResult<AuthResponse>> Impersonate(Guid id)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id);
        if (tenant is null) return NotFound();

        var superAdmin = await CurrentSuperAdminAsync();
        if (superAdmin is null) return Unauthorized();

        var token = tokenService.CreateAccessToken(superAdmin, impersonatedTenantId: tenant.Id);
        return Ok(new AuthResponse(token, UserDto.ForImpersonation(superAdmin, tenant)));
    }

    [HttpPost("exit-impersonation")]
    public async Task<ActionResult<AuthResponse>> ExitImpersonation()
    {
        var superAdmin = await CurrentSuperAdminAsync();
        if (superAdmin is null) return Unauthorized();

        var token = tokenService.CreateAccessToken(superAdmin);
        return Ok(new AuthResponse(token, UserDto.ForUser(superAdmin)));
    }

    private async Task<ApplicationUser?> CurrentSuperAdminAsync()
    {
        if (currentUser.UserId is not { } userId) return null;
        return await userManager.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId);
    }

    private static string SlugFor(string name)
    {
        var lowered = name.Trim().ToLowerInvariant();
        var cleaned = System.Text.RegularExpressions.Regex.Replace(lowered, "[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(cleaned) ? Guid.NewGuid().ToString("N")[..8] : cleaned;
    }
}
