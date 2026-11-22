using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>
/// Gives a customer a way into their own file — a particulier, or one named contact at a client
/// company. Deliberately separate from <see cref="IEmployeeAccessService"/> even though the
/// invitation is the same: an employee costs a seat and gets the run of the company, a customer
/// costs nothing and is confined to their own records. Folding the two together would make it
/// one edit away from a customer holding a staff account.
/// </summary>
public interface IClientAccessService
{
    /// <summary>Creates the passwordless account, scopes it to this client, and invites them.</summary>
    Task<(AccessGrant? Grant, string? Error)> GrantAsync(IInvitable target, Guid clientId, CancellationToken ct = default);

    /// <summary>Issues a fresh token for someone who has an account but has never set a password.</summary>
    Task<(AccessGrant? Grant, string? Error)> ResendAsync(IInvitable target, CancellationToken ct = default);

    /// <summary>Deletes the account and the membership. The client record is kept.</summary>
    Task RevokeAsync(IInvitable target, CancellationToken ct = default);
}

public class ClientAccessService(
    VextaDbContext db,
    UserManager<ApplicationUser> userManager,
    IMailgunService mailgun,
    IWorkspaceService workspaces,
    IConfiguration configuration,
    ILogger<ClientAccessService> logger) : IClientAccessService
{
    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    public async Task<(AccessGrant?, string?)> GrantAsync(IInvitable target, Guid clientId, CancellationToken ct = default)
    {
        if (target.UserId is not null)
        {
            return (null, "Cette personne a déjà un accès.");
        }

        var email = target.Email?.Trim();
        if (string.IsNullOrWhiteSpace(email))
        {
            return (null, "Ajoutez un courriel avant de donner un accès.");
        }

        // An address can already belong to a Vexta account — a customer who is also somebody's
        // employee, or who has their own personal space. That account is the person, so it is
        // joined to this company as a customer rather than refused.
        var existing = await userManager.FindByEmailAsync(email);
        if (existing is not null)
        {
            if (await db.TenantMemberships.AnyAsync(
                    m => m.UserId == existing.Id && m.TenantId == target.TenantId, ct))
            {
                return (null, "Ce compte a déjà un accès à cet espace.");
            }

            db.TenantMemberships.Add(new TenantMembership
            {
                UserId = existing.Id,
                TenantId = target.TenantId,
                Role = UserRole.Client,
                ClientId = clientId
            });

            target.UserId = existing.Id;
            target.UpdatedAt = DateTimeOffset.UtcNow;

            if (await userManager.HasPasswordAsync(existing))
            {
                return (AccessGrant.Linked(), null);
            }

            return (await IssueInvitationAsync(target, ct), null);
        }

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FirstName = target.FirstName ?? string.Empty,
            LastName = target.LastName ?? string.Empty,
            Role = UserRole.Client,
            TenantId = target.TenantId
        };

        // No password on purpose: the account cannot be signed into until the invitation is
        // accepted, so an unanswered invitation is never a way in.
        var created = await userManager.CreateAsync(user);
        if (!created.Succeeded)
        {
            return (null, string.Join(" ", created.Errors.Select(e => e.Description)));
        }

        // The membership is what carries the scope. Without it the account would sign in with no
        // client id on its token, and the query filters would show it the whole company.
        db.TenantMemberships.Add(new TenantMembership
        {
            UserId = user.Id,
            TenantId = target.TenantId,
            Role = UserRole.Client,
            ClientId = clientId
        });

        target.UserId = user.Id;
        target.UpdatedAt = DateTimeOffset.UtcNow;

        return (await IssueInvitationAsync(target, ct), null);
    }

    public async Task<(AccessGrant?, string?)> ResendAsync(IInvitable target, CancellationToken ct = default)
    {
        if (target.UserId is not { } userId)
        {
            return (null, "Cette personne n'a pas d'accès à renvoyer.");
        }

        var user = await userManager.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return (null, "Le compte lié à cette personne est introuvable.");
        }

        if (await userManager.HasPasswordAsync(user))
        {
            return (null, "Cette personne a déjà configuré son mot de passe. Elle peut se connecter directement.");
        }

        return (await IssueInvitationAsync(target, ct), null);
    }

    public async Task RevokeAsync(IInvitable target, CancellationToken ct = default)
    {
        if (target.UserId is { } userId)
        {
            var user = await userManager.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, ct);
            if (user is not null)
            {
                await workspaces.ReleaseAsync(user, target.TenantId, ct);
            }
        }

        target.UserId = null;
        target.InvitationTokenHash = null;
        target.InvitationExpiresAt = null;
        target.InvitationSentAt = null;
        target.UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Mints a token, stores only its hash, and tries to mail the link. Issuing a new one
    /// invalidates whatever was outstanding, because only one hash is kept.
    /// </summary>
    private async Task<AccessGrant> IssueInvitationAsync(IInvitable target, CancellationToken ct)
    {
        var token = InvitationToken.Create();
        var expiresAt = DateTimeOffset.UtcNow.Add(InvitationToken.Lifetime);

        target.InvitationTokenHash = InvitationToken.Hash(token);
        target.InvitationExpiresAt = expiresAt;
        target.InvitationSentAt = null;
        target.UpdatedAt = DateTimeOffset.UtcNow;

        var url = $"{FrontendUrl}/bienvenue/{token}";
        if (await TrySendInvitationAsync(target, url, expiresAt, ct))
        {
            target.InvitationSentAt = DateTimeOffset.UtcNow;
            return new AccessGrant(url, expiresAt, true);
        }

        return new AccessGrant(url, expiresAt, false);
    }

    private async Task<bool> TrySendInvitationAsync(IInvitable target, string url, DateTimeOffset expiresAt, CancellationToken ct)
    {
        if (!await mailgun.IsConfiguredAsync(ct)) return false;

        var tenantName = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == target.TenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct);

        // Two uses, two fallbacks. In the sentence a missing name has to become something
        // readable; as the sender it has to stay null, because "votre fournisseur" in a From
        // header is worse than the platform's own name.
        var companyName = tenantName ?? "votre fournisseur";

        var body = $"""
            <p>Bonjour {System.Net.WebUtility.HtmlEncode(target.FirstName ?? "")},</p>
            <p><strong>{System.Net.WebUtility.HtmlEncode(companyName)}</strong> vous donne accès à vos
            projets et à vos factures. Choisissez votre mot de passe pour l'activer :</p>
            <p><a href="{url}">Configurer mon mot de passe</a></p>
            <p>Ce lien expire le {expiresAt.ToLocalTime():d MMMM yyyy}. Passé ce délai, demandez-leur
            de vous en renvoyer un.</p>
            """;

        try
        {
            var fullName = $"{target.FirstName} {target.LastName}".Trim();
            await mailgun.SendAsync(
                target.Email!, fullName, $"Vos documents chez {companyName}", body, ct, tenantName);
            return true;
        }
        catch (Exception ex)
        {
            // The grant itself already succeeded. Failing it here would leave an account nobody
            // can reach; the admin still has the link to pass along by hand.
            logger.LogWarning(ex, "Envoi de l'invitation client à {Email} impossible.", target.Email);
            return false;
        }
    }
}
