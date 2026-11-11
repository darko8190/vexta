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
    IStripeService stripeService,
    IConfiguration configuration) : ControllerBase
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
        var existing = await userManager.FindByEmailAsync(request.Email.Trim());
        if (existing is not null)
        {
            return Conflict(new { message = "Un compte existe déjà avec ce courriel." });
        }

        var slug = SlugFor(request.CompanyName);
        var suffix = 1;
        while (await db.Tenants.AnyAsync(t => t.Slug == slug))
        {
            slug = $"{SlugFor(request.CompanyName)}-{++suffix}";
        }

        var tenant = new Tenant { Name = request.CompanyName.Trim(), Slug = slug };
        db.Tenants.Add(tenant);

        var user = new ApplicationUser
        {
            UserName = request.Email.Trim(),
            Email = request.Email.Trim(),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Role = UserRole.TenantAdmin,
            TenantId = tenant.Id
        };

        var createResult = await userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", createResult.Errors.Select(e => e.Description)) });
        }

        await db.SaveChangesAsync();

        var frontendUrl = configuration["Frontend:BaseUrl"] ?? "http://localhost:3000";
        var checkoutUrl = await stripeService.CreateCheckoutSessionAsync(
            tenant,
            user.Email!,
            successUrl: $"{frontendUrl}/inscription/succes",
            cancelUrl: $"{frontendUrl}/inscription/annule");

        return Ok(new RegisterTenantResponse(checkoutUrl));
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> Me()
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var user = await userManager.Users.Include(u => u.Tenant).FirstOrDefaultAsync(u => u.Id.ToString() == userId);
        if (user is null) return Unauthorized();

        return Ok(ToUserDto(user));
    }

    private async Task<AuthResponse> BuildAuthResponseAsync(ApplicationUser user)
    {
        await db.Entry(user).Reference(u => u.Tenant).LoadAsync();
        var token = tokenService.CreateAccessToken(user);
        return new AuthResponse(token, ToUserDto(user));
    }

    private static UserDto ToUserDto(ApplicationUser user) => new(
        user.Id,
        user.Email ?? string.Empty,
        user.FirstName,
        user.LastName,
        user.Role.ToString(),
        user.TenantId,
        user.Tenant?.Name,
        user.Tenant?.SubscriptionStatus.ToString());

    private static string SlugFor(string name)
    {
        var lowered = name.Trim().ToLowerInvariant();
        var cleaned = System.Text.RegularExpressions.Regex.Replace(lowered, "[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(cleaned) ? Guid.NewGuid().ToString("N")[..8] : cleaned;
    }
}
