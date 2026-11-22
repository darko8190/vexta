using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>How many sign-in accounts a tenant may have, and how many it is using.</summary>
public record SeatUsage(int Used, int Limit, string? LimitReason)
{
    public int Remaining => Math.Max(0, Limit - Used);
    public bool HasRoom => Used < Limit;
}

/// <summary>
/// The outcome of granting access. <see cref="InvitationUrl"/> is shown to the admin whether or
/// not the email went out: an invitation nobody can deliver is an invitation nobody can accept,
/// and Mailgun is optional on purpose.
/// </summary>
public record AccessGrant(string? InvitationUrl, DateTimeOffset? ExpiresAt, bool EmailSent)
{
    /// <summary>
    /// An account that already existed and already has a password. Nothing was sent and there is
    /// no link to show: the space just appears in their switcher.
    /// </summary>
    public static AccessGrant Linked() => new(null, null, false);
}

public interface IEmployeeAccessService
{
    Task<SeatUsage> GetSeatUsageAsync(Guid tenantId, CancellationToken ct = default);

    /// <summary>Creates the passwordless account, links it, and issues the first invitation.</summary>
    Task<(AccessGrant? Grant, string? Error)> GrantAsync(Employee employee, CancellationToken ct = default);

    /// <summary>Issues a fresh token for an employee who already has an account but no password yet.</summary>
    Task<(AccessGrant? Grant, string? Error)> ResendAsync(Employee employee, CancellationToken ct = default);

    /// <summary>Deletes the sign-in account and frees the seat. The employee record is kept.</summary>
    Task RevokeAsync(Employee employee, CancellationToken ct = default);
}

public class EmployeeAccessService(
    VextaDbContext db,
    UserManager<ApplicationUser> userManager,
    IMailgunService mailgun,
    IWorkspaceService workspaces,
    IConfiguration configuration,
    ILogger<EmployeeAccessService> logger) : IEmployeeAccessService
{
    public static readonly TimeSpan InvitationLifetime = InvitationToken.Lifetime;

    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    public async Task<SeatUsage> GetSeatUsageAsync(Guid tenantId, CancellationToken ct = default)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => new { t.Kind, t.PlanId, PlanName = t.Plan!.Name, PlanMaxUsers = (int?)t.Plan!.MaxUsers })
            .FirstOrDefaultAsync(ct);

        // Counted by memberships, not by whose home space this is. A person can belong to this
        // company and still live in their own personal space — they hold a seat here either way,
        // and counting homes would miss them entirely.
        //
        // Customers are excluded: a seat is sold for someone who runs the business, and a company
        // does not pay by the number of its clients.
        var used = await db.TenantMemberships
            .CountAsync(m => m.TenantId == tenantId && m.Role != UserRole.Client, ct);

        if (tenant is null)
        {
            return new SeatUsage(used, 1, "Espace introuvable.");
        }

        if (tenant.Kind == TenantKind.Personal)
        {
            return new SeatUsage(used, 1, "Un espace personnel ne compte qu'une seule personne. Passez à un compte entreprise pour ajouter des accès.");
        }

        if (tenant.PlanId is null || tenant.PlanMaxUsers is null)
        {
            return new SeatUsage(used, 1, "Aucun forfait n'est associé à cet espace, donc aucun accès supplémentaire n'est permis.");
        }

        return new SeatUsage(used, tenant.PlanMaxUsers.Value, null);
    }

    public async Task<(AccessGrant?, string?)> GrantAsync(Employee employee, CancellationToken ct = default)
    {
        if (employee.UserId is not null)
        {
            return (null, "Cet employé a déjà un accès.");
        }

        var seats = await GetSeatUsageAsync(employee.TenantId, ct);
        if (!seats.HasRoom)
        {
            return (null, seats.LimitReason
                ?? $"Le forfait permet {seats.Limit} accès et ils sont tous utilisés. Retirez un accès ou changez de forfait.");
        }

        var email = employee.Email.Trim();

        // An address can already belong to a Vexta account: someone rehired, or someone who
        // already uses Vexta for their own space. That account is the person — a second one
        // cannot be made for them anyway, and should not be. It is joined to this company
        // instead, which is the whole point of a person belonging to several spaces.
        var existing = await userManager.FindByEmailAsync(email);
        if (existing is not null)
        {
            if (await db.TenantMemberships.AnyAsync(
                    m => m.UserId == existing.Id && m.TenantId == employee.TenantId, ct))
            {
                return (null, "Ce compte a déjà un accès à cet espace.");
            }

            db.TenantMemberships.Add(new TenantMembership
            {
                UserId = existing.Id,
                TenantId = employee.TenantId,
                Role = UserRole.TenantUser
            });

            employee.UserId = existing.Id;
            employee.UpdatedAt = DateTimeOffset.UtcNow;

            // Already chose a password at some point, so there is nothing to invite them to: the
            // company simply appears in their space switcher the next time they sign in.
            if (await userManager.HasPasswordAsync(existing))
            {
                return (AccessGrant.Linked(), null);
            }

            return (await IssueInvitationAsync(employee, ct), null);
        }

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FirstName = employee.FirstName,
            LastName = employee.LastName,
            Role = UserRole.TenantUser,
            TenantId = employee.TenantId
        };

        // No password on purpose: the account cannot be signed into until the invitation is
        // accepted, so an unanswered invitation is never a way in.
        var created = await userManager.CreateAsync(user);
        if (!created.Succeeded)
        {
            return (null, string.Join(" ", created.Errors.Select(e => e.Description)));
        }

        // Explicit rather than left to the lazy backfill: the seat count reads memberships, and
        // a seat that only appears once the person opens their switcher is a seat nobody is
        // charged for in the meantime.
        db.TenantMemberships.Add(new TenantMembership
        {
            UserId = user.Id,
            TenantId = employee.TenantId,
            Role = UserRole.TenantUser
        });

        employee.UserId = user.Id;
        employee.UpdatedAt = DateTimeOffset.UtcNow;

        return (await IssueInvitationAsync(employee, ct), null);
    }

    public async Task<(AccessGrant?, string?)> ResendAsync(Employee employee, CancellationToken ct = default)
    {
        if (employee.UserId is not { } userId)
        {
            return (null, "Cet employé n'a pas d'accès à renvoyer.");
        }

        var user = await userManager.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return (null, "Le compte lié à cet employé est introuvable.");
        }

        if (await userManager.HasPasswordAsync(user))
        {
            return (null, "Cet employé a déjà configuré son mot de passe. Il peut se connecter directement.");
        }

        return (await IssueInvitationAsync(employee, ct), null);
    }

    public async Task RevokeAsync(Employee employee, CancellationToken ct = default)
    {
        if (employee.UserId is { } userId)
        {
            var user = await userManager.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, ct);
            if (user is not null)
            {
                // Not a delete: the account also owns this person's own personal space, and an
                // employee who leaves must not lose it. See IWorkspaceService.ReleaseAsync.
                await workspaces.ReleaseAsync(user, employee.TenantId, ct);
            }
        }

        employee.UserId = null;
        employee.InvitationTokenHash = null;
        employee.InvitationExpiresAt = null;
        employee.InvitationSentAt = null;
        employee.UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Mints a token, stores only its hash, and tries to mail the link. Issuing a new one
    /// invalidates whatever was outstanding, because only one hash is kept.
    /// </summary>
    private async Task<AccessGrant> IssueInvitationAsync(Employee employee, CancellationToken ct)
    {
        var token = InvitationToken.Create();
        var expiresAt = DateTimeOffset.UtcNow.Add(InvitationLifetime);

        employee.InvitationTokenHash = InvitationToken.Hash(token);
        employee.InvitationExpiresAt = expiresAt;
        employee.InvitationSentAt = null;
        employee.UpdatedAt = DateTimeOffset.UtcNow;

        var url = $"{FrontendUrl}/bienvenue/{token}";
        var emailSent = await TrySendInvitationAsync(employee, url, expiresAt, ct);
        if (emailSent)
        {
            employee.InvitationSentAt = DateTimeOffset.UtcNow;
        }

        return new AccessGrant(url, expiresAt, emailSent);
    }

    private async Task<bool> TrySendInvitationAsync(Employee employee, string url, DateTimeOffset expiresAt, CancellationToken ct)
    {
        if (!await mailgun.IsConfiguredAsync(ct))
        {
            return false;
        }

        var tenantName = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == employee.TenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "votre équipe";

        var body = $"""
            <p>Bonjour {System.Net.WebUtility.HtmlEncode(employee.FirstName)},</p>
            <p>Un accès à <strong>{System.Net.WebUtility.HtmlEncode(tenantName)}</strong> vous a été créé.
            Choisissez votre mot de passe pour l'activer :</p>
            <p><a href="{url}">Configurer mon mot de passe</a></p>
            <p>Ce lien expire le {expiresAt.ToLocalTime():d MMMM yyyy}. Passé ce délai, demandez
            à votre administrateur de vous en renvoyer un.</p>
            """;

        try
        {
            await mailgun.SendAsync(employee.Email, employee.FullName, $"Votre accès à {tenantName}", body, ct);
            return true;
        }
        catch (Exception ex)
        {
            // The grant itself already succeeded. Failing it here would leave an account nobody
            // can reach; the admin still has the link to pass along by hand.
            logger.LogWarning(ex, "Envoi de l'invitation à {Email} impossible.", employee.Email);
            return false;
        }
    }

}
