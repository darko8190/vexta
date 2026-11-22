using System.Security.Cryptography;
using System.Text;
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
public record AccessGrant(string InvitationUrl, DateTimeOffset ExpiresAt, bool EmailSent);

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
    IConfiguration configuration,
    ILogger<EmployeeAccessService> logger) : IEmployeeAccessService
{
    /// <summary>
    /// Long enough that a person can be reached on a weekend, short enough that a link forwarded
    /// into a mailing list stops working before anyone finds it.
    /// </summary>
    public static readonly TimeSpan InvitationLifetime = TimeSpan.FromDays(7);

    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    public async Task<SeatUsage> GetSeatUsageAsync(Guid tenantId, CancellationToken ct = default)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => new { t.Kind, t.PlanId, PlanName = t.Plan!.Name, PlanMaxUsers = (int?)t.Plan!.MaxUsers })
            .FirstOrDefaultAsync(ct);

        var used = await db.Users.IgnoreQueryFilters().CountAsync(u => u.TenantId == tenantId, ct);

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

        // RequireUniqueEmail is on, so an address already used anywhere — including in another
        // tenant — cannot become a second account. Saying so is better than a raw Identity error.
        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return (null, "Un compte existe déjà avec ce courriel.");
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
                await userManager.DeleteAsync(user);
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
        var token = CreateToken();
        var expiresAt = DateTimeOffset.UtcNow.Add(InvitationLifetime);

        employee.InvitationTokenHash = HashToken(token);
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

    private static string CreateToken() =>
        Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    public static string HashToken(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
