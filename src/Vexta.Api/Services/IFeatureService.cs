using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>
/// Answers "is this company allowed to do that", where "that" is something sold on the plan
/// rather than something shown in the menu. See <see cref="Feature"/>.
/// </summary>
public interface IFeatureService
{
    Task<bool> IsEnabledAsync(string key, CancellationToken ct = default);

    /// <summary>The keys in force for the current space, for a browser deciding what to draw.</summary>
    Task<IReadOnlyList<string>> ActiveKeysAsync(CancellationToken ct = default);
}

public class FeatureService(VextaDbContext db, ICurrentUserService currentUser) : IFeatureService
{
    public async Task<bool> IsEnabledAsync(string key, CancellationToken ct = default) =>
        (await ActiveKeysAsync(ct)).Contains(key, StringComparer.Ordinal);

    public async Task<IReadOnlyList<string>> ActiveKeysAsync(CancellationToken ct = default)
    {
        if (currentUser.TenantId is not { } tenantId) return [];

        var planId = await db.Tenants.AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.PlanId)
            .FirstOrDefaultAsync(ct);

        // No plan means a space created by hand — every tenant on a development machine, and
        // the ones made for a trial. Refusing everything would leave those spaces unable to try
        // the things they were made to try, so they get the lot. This is the same call the
        // receipt scanner's default allowance makes, for the same reason.
        if (planId is null)
        {
            return await db.Features.AsNoTracking().Select(f => f.Key).ToListAsync(ct);
        }

        return await db.Plans.AsNoTracking()
            .Where(p => p.Id == planId)
            .SelectMany(p => p.Features.Select(f => f.Key))
            .ToListAsync(ct);
    }
}
