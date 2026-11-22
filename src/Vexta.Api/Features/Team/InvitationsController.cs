using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Auth;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Team;

/// <summary>
/// Where anyone holding an invitation lands — an employee, a client, a contact at a client.
/// Anonymous by necessity, since they have no account to sign in with yet, so every lookup goes
/// through the token hash and nothing else.
/// </summary>
[ApiController]
[Route("api/invitations")]
[AllowAnonymous]
public class InvitationsController(
    VextaDbContext db,
    UserManager<ApplicationUser> userManager,
    IWorkspaceService workspaces,
    ITokenService tokenService) : ControllerBase
{
    [HttpGet("{token}")]
    public async Task<ActionResult<InvitationDto>> Get(string token, CancellationToken ct)
    {
        var invited = await FindAsync(token, ct);
        if (invited is null)
        {
            return NotFound(new { message = "Cette invitation n'existe pas ou a déjà été utilisée." });
        }

        if (invited.InvitationExpiresAt <= DateTimeOffset.UtcNow)
        {
            return StatusCode(StatusCodes.Status410Gone, new
            {
                message = "Cette invitation a expiré. Demandez à votre administrateur de vous en renvoyer une."
            });
        }

        var tenantName = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == invited.TenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct);

        return Ok(new InvitationDto(invited.FirstName ?? "", invited.LastName ?? "", invited.Email ?? "", tenantName ?? ""));
    }

    [HttpPost("{token}/accept")]
    public async Task<ActionResult<AuthResponse>> Accept(string token, AcceptInvitationRequest request, CancellationToken ct)
    {
        var invited = await FindAsync(token, ct);
        if (invited is null)
        {
            return NotFound(new { message = "Cette invitation n'existe pas ou a déjà été utilisée." });
        }

        if (invited.InvitationExpiresAt <= DateTimeOffset.UtcNow)
        {
            return StatusCode(StatusCodes.Status410Gone, new
            {
                message = "Cette invitation a expiré. Demandez à votre administrateur de vous en renvoyer une."
            });
        }

        if (invited.UserId is not { } userId)
        {
            return BadRequest(new { message = "Cet accès a été retiré." });
        }

        var user = await userManager.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return BadRequest(new { message = "Cet accès a été retiré." });
        }

        // Only a password-less account can be claimed this way. Otherwise a token kept from an
        // earlier invitation would be a way to overwrite a password that is already in use.
        if (await userManager.HasPasswordAsync(user))
        {
            return BadRequest(new { message = "Ce compte a déjà un mot de passe. Connectez-vous normalement." });
        }

        var result = await userManager.AddPasswordAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", result.Errors.Select(e => e.Description)) });
        }

        // The token is single use: clearing the hash is what spends it.
        invited.InvitationTokenHash = null;
        invited.InvitationExpiresAt = null;
        invited.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        await db.Entry(user).Reference(u => u.Tenant).LoadAsync(ct);

        // From the membership, like every other sign-in: a client accepting an invitation needs
        // the scope on their very first token, not on the one after they sign in again.
        var membership = await workspaces.HomeMembershipAsync(user, ct);
        var accessToken = membership is null
            ? tokenService.CreateAccessToken(user)
            : tokenService.CreateAccessToken(user, membership);

        return Ok(new AuthResponse(accessToken, UserDto.ForUser(user)));
    }

    /// <summary>
    /// Three places an invitation can live, one token space: the hash is 32 random bytes, so a
    /// token can only ever match the record it was issued for.
    ///
    /// IgnoreQueryFilters is required, not incidental: the caller has no session, so the tenant
    /// filter would match nothing and every invitation would look used.
    /// </summary>
    private async Task<IInvitable?> FindAsync(string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var hash = InvitationToken.Hash(token);

        return await db.Employees.IgnoreQueryFilters()
                   .FirstOrDefaultAsync(e => e.InvitationTokenHash == hash, ct)
               ?? await db.ClientContacts.IgnoreQueryFilters()
                   .FirstOrDefaultAsync(c => c.InvitationTokenHash == hash, ct)
               ?? (IInvitable?)await db.Clients.IgnoreQueryFilters()
                   .FirstOrDefaultAsync(c => c.InvitationTokenHash == hash, ct);
    }
}
