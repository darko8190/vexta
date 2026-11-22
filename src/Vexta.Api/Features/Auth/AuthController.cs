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
            externalLogin: null);

        if (!result.Succeeded) return BadRequest(new { message = result.Error });

        return Ok(RegisterTenantResponse.For(result, tokenService));
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
                SlideSession(() => tokenService.CreateAccessToken(user, membership));
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

        SlideSession(() => home is not null
            ? tokenService.CreateAccessToken(user, home)
            : tokenService.CreateAccessToken(user));
        return Ok(UserDto.ForUser(user));
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
    /// </summary>
    private void SlideSession(Func<string> issue)
    {
        var expiry = currentUser.ExpiresAt;
        if (expiry is null) return;

        var window = TimeSpan.FromMinutes(jwtOptions.Value.AccessTokenMinutes);
        if (expiry.Value - DateTimeOffset.UtcNow > window / 2) return;

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
        return new AuthResponse(token, UserDto.ForUser(user));
    }
}
