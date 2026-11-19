using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
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
    ICurrentUserService currentUser) : ControllerBase
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
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var user = await userManager.Users.Include(u => u.Tenant).FirstOrDefaultAsync(u => u.Id.ToString() == userId);
        if (user is null) return Unauthorized();

        // Keeps an impersonation session alive across page reloads: the tenant lives in the token,
        // not in the super admin's own row.
        if (currentUser.IsImpersonating && currentUser.TenantId is { } tenantId)
        {
            var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId);
            if (tenant is not null)
            {
                return Ok(UserDto.ForImpersonation(user, tenant));
            }
        }

        return Ok(UserDto.ForUser(user));
    }

    private async Task<AuthResponse> BuildAuthResponseAsync(ApplicationUser user)
    {
        await db.Entry(user).Reference(u => u.Tenant).LoadAsync();
        var token = tokenService.CreateAccessToken(user);
        return new AuthResponse(token, UserDto.ForUser(user));
    }
}
