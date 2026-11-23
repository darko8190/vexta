using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Dashboard;

/// <summary>
/// The platform's own figures.
///
/// Its own endpoint rather than a branch inside the company dashboard: the two screens share
/// nothing. A company asks what it billed; the platform asks how many companies are paying, how
/// many are still on trial and how many have fallen into arrears — and the second question is
/// asked across every tenant, which is exactly what the company endpoint must never do.
/// </summary>
[ApiController]
[Route("api/admin/tableau-de-bord")]
[Authorize(Roles = Roles.Platform)]
public class AdminDashboardController(VextaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AdminDashboardDto>> Get(CancellationToken ct)
    {
        var today = BusinessDay.Today;
        var monthStart = new DateTimeOffset(new DateTime(today.Year, today.Month, 1), TimeSpan.Zero);

        // IgnoreQueryFilters throughout: a super admin is outside every tenant, so the filters
        // that keep companies apart would answer zero for all of this.
        var tenants = db.Tenants.IgnoreQueryFilters().AsNoTracking();

        var business = tenants.Where(t => t.Kind == TenantKind.Business);

        var trialing = await business
            .Where(t => t.SubscriptionStatus == TenantSubscriptionStatus.Trialing)
            .ToListAsync(ct);

        return Ok(new AdminDashboardDto(
            await business.CountAsync(ct),
            await business.CountAsync(t => t.SubscriptionStatus == TenantSubscriptionStatus.Active, ct),
            // Counted on the date rather than on the status, because nothing sweeps expired
            // trials: the row still says Trialing the morning after it ran out.
            trialing.Count(t => t.TrialEndsAt > DateTimeOffset.UtcNow),
            trialing.Count(t => t.TrialEndsAt <= DateTimeOffset.UtcNow),
            await business.CountAsync(t => t.SubscriptionStatus == TenantSubscriptionStatus.PastDue, ct),
            await business.CountAsync(t => t.SubscriptionStatus == TenantSubscriptionStatus.Incomplete, ct),
            await business.CountAsync(t => t.CreatedAt >= monthStart, ct),
            await tenants.CountAsync(t => t.Kind == TenantKind.Personal, ct),
            await db.Plans.IgnoreQueryFilters().CountAsync(p => p.IsPublished, ct),
            await db.Modules.IgnoreQueryFilters().CountAsync(ct),
            await db.Users.IgnoreQueryFilters().CountAsync(ct)));
    }
}

/// <summary>
/// What the platform is, in counts. Money is deliberately absent: what a company pays is in
/// Stripe, and a figure added up here would be a second answer that disagrees with the invoices
/// Stripe actually issued.
/// </summary>
public record AdminDashboardDto(
    int BusinessTenants,
    int Active,
    /// <summary>On trial with days left.</summary>
    int Trialing,
    /// <summary>Still marked as trialing, but the date has passed. Nobody chased them.</summary>
    int TrialExpired,
    int PastDue,
    /// <summary>Signed up and never finished paying.</summary>
    int Incomplete,
    int NewThisMonth,
    int PersonalSpaces,
    int PublishedPlans,
    int Modules,
    int Users);
