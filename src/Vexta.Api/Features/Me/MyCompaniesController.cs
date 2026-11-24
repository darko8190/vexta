using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Me;

/// <summary>One company this person runs.</summary>
public record MyCompanyDto(
    Guid TenantId,
    string Name,
    string Slug,
    string? PlanName,
    TenantSubscriptionStatus SubscriptionStatus,
    DateTimeOffset? TrialEndsAt,
    DateTimeOffset CreatedAt);

public record CreateMyCompanyRequest(string CompanyName, Guid? PlanId, CompanySignupProfile? Profile);

/// <param name="CheckoutUrl">Where to pay, or null when the plan opens on a trial.</param>
public record CreateMyCompanyResponse(Guid TenantId, string? CheckoutUrl);

/// <summary>
/// The companies a person owns, read and opened from their personal space.
///
/// "Owns" means administrator of it: the role the founder is given, and the one that decides
/// its plan, its staff and its card. A company where they are an employee is not theirs, and
/// lives in the space switcher rather than here.
///
/// Keyed on the account, never on the space the token is in: this is asked from the personal
/// space, about companies, so the tenant in the token is the one thing it must not filter by.
/// </summary>
[ApiController]
[Route("api/mes-entreprises")]
[Authorize]
public class MyCompaniesController(
    VextaDbContext db,
    UserManager<ApplicationUser> userManager,
    ITenantSignupService signup) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<MyCompanyDto>>> List(CancellationToken ct)
    {
        var user = await CurrentUserAsync();
        if (user is null) return Unauthorized();

        // IgnoreQueryFilters: the filters scope to the tenant in the token, which is the
        // personal space, and every row wanted here belongs to some other tenant.
        var inactive = await db.Employees.IgnoreQueryFilters().AsNoTracking()
            .Where(e => e.UserId == user.Id)
            .GroupBy(e => e.TenantId)
            .Where(g => g.All(e => !e.IsActive))
            .Select(g => g.Key)
            .ToListAsync(ct);

        var items = await db.TenantMemberships.IgnoreQueryFilters().AsNoTracking()
            .Where(m => m.UserId == user.Id
                && m.Role == UserRole.TenantAdmin
                && m.Tenant!.Kind == TenantKind.Business
                && !inactive.Contains(m.TenantId))
            .OrderBy(m => m.Tenant!.Name)
            .Select(m => new MyCompanyDto(
                m.TenantId,
                m.Tenant!.Name,
                m.Tenant.Slug,
                m.Tenant.Plan == null ? null : m.Tenant.Plan.Name,
                m.Tenant.SubscriptionStatus,
                m.Tenant.TrialEndsAt,
                m.Tenant.CreatedAt))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    public async Task<ActionResult<CreateMyCompanyResponse>> Create(CreateMyCompanyRequest request, CancellationToken ct)
    {
        var user = await CurrentUserAsync();
        if (user is null) return Unauthorized();

        // The platform's own account runs no company; it enters them.
        if (user.Role == UserRole.SuperAdmin) return Forbid();

        var result = await signup.CreateForExistingUserAsync(
            user, request.CompanyName, request.PlanId, request.Profile, ct);

        if (!result.Succeeded) return BadRequest(new { message = result.Error });

        return Ok(new CreateMyCompanyResponse(result.TenantId!.Value, result.CheckoutUrl));
    }

    private Task<ApplicationUser?> CurrentUserAsync()
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return userManager.Users.FirstOrDefaultAsync(u => u.Id.ToString() == userId);
    }
}
