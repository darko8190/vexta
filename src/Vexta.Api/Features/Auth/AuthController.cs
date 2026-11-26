using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Auth;

[ApiController]
[Route("api/auth")]
public class AuthController(
    UserManager<ApplicationUser> userManager,
    VextaDbContext db,
    ITokenService tokenService,
    ITenantSignupService tenantSignup,
    IWorkspaceService workspaces,
    ICurrentUserService currentUser,
    IPasswordResetService passwordReset,
    IEmailConfirmationService emailConfirmation,
    IOptions<JwtOptions> jwtOptions) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null || await userManager.IsLockedOutAsync(user))
        {
            return Unauthorized(new { message = "Courriel ou mot de passe invalide." });
        }

        var passwordValid = await userManager.CheckPasswordAsync(user, request.Password);
        if (!passwordValid)
        {
            await userManager.AccessFailedAsync(user);
            return Unauthorized(new { message = "Courriel ou mot de passe invalide." });
        }

        await userManager.ResetAccessFailedCountAsync(user);
        return Ok(await BuildAuthResponseAsync(user));
    }

    [HttpPost("register-tenant")]
    [AllowAnonymous]
    public async Task<ActionResult<RegisterTenantResponse>> RegisterTenant(RegisterTenantRequest request)
    {
        var result = await tenantSignup.CreateAsync(
            request.CompanyName,
            request.Kind,
            request.PlanId,
            request.FirstName,
            request.LastName,
            request.Email,
            request.Password,
            externalLogin: null,
            profile: request.Profile);

        if (!result.Succeeded) return BadRequest(new { message = result.Error });

        return Ok(RegisterTenantResponse.For(result, tokenService));
    }

    /// <summary>
    /// Asks for a reset link. Answers the same thing whether or not the address has an account:
    /// a different answer would turn this into a way of finding out who banks with us.
    /// </summary>
    [HttpPost("mot-de-passe-oublie")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request)
    {
        await passwordReset.SendLinkAsync(request.Email, HttpContext.RequestAborted);

        return Ok(new
        {
            message = "Si un compte utilise cette adresse, un lien vient d'y être envoyé. "
                + "Vérifiez aussi votre dossier de courrier indésirable."
        });
    }

    /// <summary>
    /// The signed-in person asking for their own link, from their profile. Here the answer can
    /// be honest — they already know the address has an account, it is theirs.
    /// </summary>
    [HttpPost("mot-de-passe/reinitialisation")]
    [Authorize]
    public async Task<IActionResult> RequestOwnPasswordReset()
    {
        var user = await CurrentUserAsync();
        if (user is null) return Unauthorized();

        if (!await passwordReset.SendLinkToUserAsync(user, HttpContext.RequestAborted))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Le courriel n'a pas pu être envoyé. Réessayez dans quelques minutes."
            });
        }

        return Ok(new { message = $"Un lien vient d'être envoyé à {user.Email}." });
    }

    /// <summary>Whether the signed-in person has proved their address yet.</summary>
    [HttpGet("courriel")]
    [Authorize]
    public async Task<IActionResult> EmailStatus()
    {
        var user = await CurrentUserAsync();
        if (user is null) return Unauthorized();

        return Ok(new { email = user.Email, confirmed = user.EmailConfirmed });
    }

    /// <summary>Sends the signed-in person a link proving their address is theirs.</summary>
    [HttpPost("courriel/verification")]
    [Authorize]
    public async Task<IActionResult> SendEmailConfirmation()
    {
        var user = await CurrentUserAsync();
        if (user is null) return Unauthorized();
        if (user.EmailConfirmed) return Ok(new { message = "Votre adresse est déjà confirmée." });

        if (!await emailConfirmation.SendLinkAsync(user, HttpContext.RequestAborted))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Le courriel n'a pas pu être envoyé. Réessayez dans quelques minutes."
            });
        }

        return Ok(new { message = $"Un lien vient d'être envoyé à {user.Email}." });
    }

    /// <summary>
    /// Applies the link. Anonymous on purpose: the link may be opened on a phone where the
    /// person is not signed in, and the token alone is the proof.
    /// </summary>
    [HttpPost("courriel/confirmer")]
    [AllowAnonymous]
    public async Task<IActionResult> ConfirmEmail(ConfirmEmailRequest request)
    {
        var error = await emailConfirmation.ConfirmAsync(request.Token, HttpContext.RequestAborted);
        if (error is not null) return BadRequest(new { message = error });

        return Ok(new { message = "Votre adresse est confirmée." });
    }

    [HttpPost("reinitialiser-mot-de-passe")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        var outcome = await passwordReset.ResetAsync(
            request.Token, request.Password, HttpContext.RequestAborted);

        if (!outcome.Succeeded) return BadRequest(new { message = outcome.Error });

        return Ok(new { message = "Votre mot de passe est changé. Connectez-vous avec le nouveau." });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await CurrentUserAsync();
        if (user is null) return Unauthorized();

        // Keeps an impersonation session alive across page reloads: the tenant lives in the token,
        // not in the super admin's own row.
        if (currentUser.IsImpersonating && currentUser.TenantId is { } impersonated)
        {
            var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == impersonated);
            if (tenant is not null)
            {
                SlideSession(() => tokenService.CreateAccessToken(user, impersonatedTenantId: tenant.Id));
                return Ok(UserDto.ForImpersonation(user, tenant));
            }
        }

        // The token decides which space this is, not the account's own row: after a switch the
        // two differ, and reading the row would send the person back to the space they left on
        // the next reload.
        if (currentUser.TenantId is { } current && current != user.TenantId)
        {
            var membership = await workspaces.FindAsync(user.Id, current, HttpContext.RequestAborted);
            if (membership?.Tenant is not null)
            {
                SlideSession(() => tokenService.CreateAccessToken(user, membership), membership.Role);
                return Ok(UserDto.ForWorkspace(user, membership.Tenant, membership.Role));
            }
        }

        // A client's token carries the client record they are confined to, and a member's
        // carries the role their membership gives them — neither of those lives on the account
        // row. Renewing from the account alone would quietly drop the first and guess at the
        // second, so the membership is used whenever this person has one here.
        var home = currentUser.TenantId is { } own
            ? await workspaces.FindAsync(user.Id, own, HttpContext.RequestAborted)
            : null;

        // No place left in the space the token is for — an employee the company has since
        // marked inactive. Renewing from the account would hand them that same company back,
        // because an invited employee's account lives there; they are moved to the one space
        // that is always theirs instead, and at once rather than at the session's halfway mark.
        var movedOut = home is null && currentUser.TenantId is not null;
        if (movedOut) home = await workspaces.HomeMembershipAsync(user, HttpContext.RequestAborted);

        SlideSession(
            () => home is not null
                ? tokenService.CreateAccessToken(user, home)
                : tokenService.CreateAccessToken(user),
            home?.Role,
            force: movedOut);
        return Ok(UserDto.ForHome(user, home));
    }

    /// <summary>
    /// Pushes the session's expiry back while the app is being used, so the configured window is
    /// an idle window rather than a hard stop. Without it the token is a countdown that starts
    /// at sign-in: someone working in Vexta all month would still be thrown out mid-task.
    ///
    /// Only past the halfway mark, so an app that polls does not mint a token per request, and
    /// the browser is not handed a new cookie on every page it opens.
    ///
    /// The caller passes a factory rather than a token: building one costs a signature, and the
    /// usual answer here is that nothing needs to be built at all.
    ///
    /// <paramref name="currentRole"/> is the role the membership gives right now. When it no
    /// longer matches the one the token was signed with, the token is reissued immediately
    /// whatever its expiry: an employee promoted this morning should not have to wait out a
    /// thirty-day window — or be told to sign out and back in — before the promotion works.
    /// </summary>
    private void SlideSession(Func<string> issue, UserRole? currentRole = null, bool force = false)
    {
        var expiry = currentUser.ExpiresAt;
        if (expiry is null) return;

        var roleChanged = currentRole is { } role && currentUser.Role != role;

        var window = TimeSpan.FromMinutes(jwtOptions.Value.AccessTokenMinutes);
        if (!force && !roleChanged && expiry.Value - DateTimeOffset.UtcNow > window / 2) return;

        Response.Headers[AuthHeaders.RenewedToken] = issue();
    }

    /// <summary>Every space this person can work in, to fill the switcher.</summary>
    [HttpGet("espaces")]
    [Authorize]
    public async Task<ActionResult<IReadOnlyList<WorkspaceDto>>> Workspaces()
    {
        var user = await CurrentUserAsync();
        if (user is null) return Unauthorized();

        return Ok(await workspaces.ListAsync(user, currentUser.TenantId, HttpContext.RequestAborted));
    }

    /// <summary>
    /// Switches to another of this person's spaces, which means a new token: the tenant and the
    /// role both live in it, and both change. The membership is checked server-side every time —
    /// asking for a space you have no place in must not be a way into it.
    /// </summary>
    [HttpPost("espaces/{tenantId:guid}")]
    [Authorize]
    public async Task<ActionResult<AuthResponse>> EnterWorkspace(Guid tenantId)
    {
        var user = await CurrentUserAsync();
        if (user is null) return Unauthorized();

        var membership = await workspaces.FindAsync(user.Id, tenantId, HttpContext.RequestAborted);
        if (membership?.Tenant is null)
        {
            return NotFound(new { message = "Vous n'avez pas accès à cet espace." });
        }

        return Ok(new AuthResponse(
            tokenService.CreateAccessToken(user, membership),
            UserDto.ForWorkspace(user, membership.Tenant, membership.Role)));
    }

    private Task<ApplicationUser?> CurrentUserAsync()
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return userManager.Users.Include(u => u.Tenant).FirstOrDefaultAsync(u => u.Id.ToString() == userId);
    }

    private async Task<AuthResponse> BuildAuthResponseAsync(ApplicationUser user)
    {
        await db.Entry(user).Reference(u => u.Tenant).LoadAsync();
        var membership = await workspaces.HomeMembershipAsync(user);
        var token = membership is null
            ? tokenService.CreateAccessToken(user)
            : tokenService.CreateAccessToken(user, membership);
        return new AuthResponse(token, UserDto.ForHome(user, membership));
    }
}
