using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>One space the signed-in person may switch into.</summary>
public record WorkspaceDto(Guid TenantId, string Name, string Kind, string Role, bool IsCurrent);

public interface IWorkspaceService
{
    /// <summary>
    /// Every space this person can enter, their personal one first. Creates what is missing
    /// before answering — see <see cref="EnsureAsync"/>.
    /// </summary>
    Task<IReadOnlyList<WorkspaceDto>> ListAsync(ApplicationUser user, Guid? currentTenantId, CancellationToken ct = default);

    /// <summary>The membership for one space, or null when this person has no place in it.</summary>
    Task<TenantMembership?> FindAsync(Guid userId, Guid tenantId, CancellationToken ct = default);

    /// <summary>
    /// The membership of the space they land in when they sign in. Every token is minted from a
    /// membership rather than from the account, because the role and the client scope both live
    /// there — a customer signing in with no scope on their token would read the whole company.
    /// </summary>
    Task<TenantMembership?> HomeMembershipAsync(ApplicationUser user, CancellationToken ct = default);

    /// <summary>
    /// Takes someone out of one space when their access there is revoked.
    ///
    /// Not the same as deleting them. An account now also owns its own personal space, so
    /// deleting it to revoke a company access would take that space and everything in it —
    /// losing a person's own data because they stopped working somewhere. They are moved to
    /// their personal space instead, which also frees the seat.
    ///
    /// The exception is an invitation that was never accepted: that account has no password, has
    /// never been anywhere, and exists only because of the grant being revoked. It is deleted,
    /// which matters because the address stays taken otherwise and the same person could not be
    /// invited a second time.
    /// </summary>
    Task ReleaseAsync(ApplicationUser user, Guid tenantId, CancellationToken ct = default);

    /// <summary>
    /// Makes sure the person has a membership for the space they belong to and a personal space
    /// of their own, creating either if it is missing.
    ///
    /// It runs here, on the way into the switcher, rather than at every point an account can be
    /// created — sign-up, an invitation accepted, a provider login, a seed. Those are four paths
    /// that each have to remember, and accounts made before any of this existed would still have
    /// nothing. One idempotent call on the way in covers all of them, old rows included.
    /// </summary>
    Task EnsureAsync(ApplicationUser user, CancellationToken ct = default);
}

public class WorkspaceService(VextaDbContext db, UserManager<ApplicationUser> userManager) : IWorkspaceService
{
    public async Task ReleaseAsync(ApplicationUser user, Guid tenantId, CancellationToken ct = default)
    {
        var memberships = await db.TenantMemberships
            .Where(m => m.UserId == user.Id)
            .Include(m => m.Tenant)
            .ToListAsync(ct);

        if (!await userManager.HasPasswordAsync(user))
        {
            // Never activated. Nothing of theirs exists to keep, and leaving the account
            // behind would hold the email address hostage against a second invitation.
            db.TenantMemberships.RemoveRange(memberships);
            db.Tenants.RemoveRange(memberships
                .Where(m => m.Tenant?.Kind == TenantKind.Personal)
                .Select(m => m.Tenant!));

            // Flushed before the delete so nothing still points at the row being removed.
            await db.SaveChangesAsync(ct);
            await userManager.DeleteAsync(user);
            return;
        }

        await EnsureAsync(user, ct);

        if (memberships.FirstOrDefault(m => m.TenantId == tenantId) is { } here)
        {
            db.TenantMemberships.Remove(here);
        }

        // Moving their home out of the company is what frees the seat: it is counted by
        // the accounts whose TenantId is the company.
        var personal = await db.TenantMemberships.Include(m => m.Tenant)
            .FirstOrDefaultAsync(m => m.UserId == user.Id && m.Tenant!.Kind == TenantKind.Personal, ct);

        user.TenantId = personal?.TenantId;
        await db.SaveChangesAsync(ct);
    }

    public async Task EnsureAsync(ApplicationUser user, CancellationToken ct = default)
    {
        // A super admin belongs to the platform, not to a space: they reach tenants by entering
        // them, which is a different mechanism and deliberately not a membership.
        if (user.Role == UserRole.SuperAdmin) return;

        var memberships = await db.TenantMemberships
            .Where(m => m.UserId == user.Id)
            .Include(m => m.Tenant)
            .ToListAsync(ct);

        var changed = false;

        if (user.TenantId is { } homeTenantId && memberships.All(m => m.TenantId != homeTenantId))
        {
            db.TenantMemberships.Add(new TenantMembership
            {
                UserId = user.Id,
                TenantId = homeTenantId,
                Role = user.Role
            });
            changed = true;
        }

        if (!memberships.Any(m => m.Tenant?.Kind == TenantKind.Personal))
        {
            var name = $"{user.FirstName} {user.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(name)) name = user.Email ?? "Espace personnel";

            var slug = await TenantSlug.UniqueAsync(
                name, candidate => db.Tenants.AnyAsync(t => t.Slug == candidate, ct));

            // Free and never billed, so SubscriptionStatus is left where it is: a personal space
            // is opened by Kind, not by pretending it pays. Owner of it, because it is theirs.
            var personal = new Tenant { Name = name, Slug = slug, Kind = TenantKind.Personal };
            db.Tenants.Add(personal);
            db.TenantMemberships.Add(new TenantMembership
            {
                UserId = user.Id,
                TenantId = personal.Id,
                Role = UserRole.TenantAdmin
            });
            changed = true;
        }

        if (changed) await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<WorkspaceDto>> ListAsync(
        ApplicationUser user, Guid? currentTenantId, CancellationToken ct = default)
    {
        await EnsureAsync(user, ct);

        var memberships = await db.TenantMemberships
            .AsNoTracking()
            .Where(m => m.UserId == user.Id)
            .Include(m => m.Tenant)
            .ToListAsync(ct);

        return memberships
            .Where(m => m.Tenant is not null)
            // Personal first: it is the one space that is always there and always free, so it is
            // the stable anchor of the switcher rather than one company among several.
            .OrderByDescending(m => m.Tenant!.Kind == TenantKind.Personal)
            .ThenBy(m => m.Tenant!.Name)
            .Select(m => new WorkspaceDto(
                m.TenantId,
                m.Tenant!.Name,
                m.Tenant.Kind.ToString(),
                m.Role.ToString(),
                m.TenantId == currentTenantId))
            .ToList();
    }

    public async Task<TenantMembership?> HomeMembershipAsync(ApplicationUser user, CancellationToken ct = default)
    {
        if (user.TenantId is not { } tenantId) return null;

        await EnsureAsync(user, ct);
        return await FindAsync(user.Id, tenantId, ct);
    }

    public Task<TenantMembership?> FindAsync(Guid userId, Guid tenantId, CancellationToken ct = default) =>
        db.TenantMemberships
            .Include(m => m.Tenant)
            .FirstOrDefaultAsync(m => m.UserId == userId && m.TenantId == tenantId, ct);
}
