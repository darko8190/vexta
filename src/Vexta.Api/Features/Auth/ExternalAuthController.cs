using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Auth;

/// <summary>
/// Google / Microsoft sign-in. The provider only proves who the person is; this controller then
/// resolves that identity against Identity's own user store, which stays the source of truth for
/// tenant_id and role.
///
/// Nothing bearer-shaped is ever put in a redirect URL. The callback hands the browser a
/// data-protected, time-limited blob that the Next.js server exchanges for the real token, the
/// same shape as an OAuth authorization code.
/// </summary>
[ApiController]
[Route("api/auth/external")]
[AllowAnonymous]
public class ExternalAuthController(
    SignInManager<ApplicationUser> signInManager,
    UserManager<ApplicationUser> userManager,
    ITokenService tokenService,
    IWorkspaceService workspaces,
    ITenantSignupService tenantSignup,
    IDataProtectionProvider dataProtection,
    IAuthenticationSchemeProvider schemeProvider,
    IConfiguration configuration,
    ILogger<ExternalAuthController> logger) : ControllerBase
{
    private static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan TicketLifetime = TimeSpan.FromMinutes(20);

    private ITimeLimitedDataProtector CodeProtector =>
        dataProtection.CreateProtector("Vexta.ExternalAuth.Code").ToTimeLimitedDataProtector();

    private ITimeLimitedDataProtector TicketProtector =>
        dataProtection.CreateProtector("Vexta.ExternalAuth.Ticket").ToTimeLimitedDataProtector();

    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    /// <summary>Which providers this deployment actually has credentials for.</summary>
    [HttpGet("providers")]
    public async Task<ActionResult<IEnumerable<string>>> Providers()
    {
        var schemes = await schemeProvider.GetAllSchemesAsync();
        var known = new[] { "Google", "Microsoft" };
        return Ok(schemes.Select(s => s.Name).Where(name => known.Contains(name)).ToArray());
    }

    /// <summary>Entry point the browser navigates to. Redirects to the provider.</summary>
    [HttpGet("{provider}/start")]
    public async Task<IActionResult> Start(string provider)
    {
        if (await schemeProvider.GetSchemeAsync(provider) is null)
        {
            return Redirect($"{FrontendUrl}/connexion?erreur=fournisseur-inconnu");
        }

        var callbackUrl = Url.Action(nameof(Callback), "ExternalAuth", null, Request.Scheme);
        var properties = signInManager.ConfigureExternalAuthenticationProperties(provider, callbackUrl);
        return Challenge(properties, provider);
    }

    /// <summary>Where the provider sends the browser back.</summary>
    [HttpGet("callback")]
    public async Task<IActionResult> Callback()
    {
        var info = await signInManager.GetExternalLoginInfoAsync();
        if (info is null)
        {
            logger.LogWarning("Retour de fournisseur externe sans information de connexion.");
            return Redirect($"{FrontendUrl}/connexion?erreur=externe");
        }

        var email = info.Principal.FindFirstValue(ClaimTypes.Email);
        if (string.IsNullOrWhiteSpace(email))
        {
            // Without a verified address there is no way to match or create an account.
            return Redirect($"{FrontendUrl}/connexion?erreur=courriel-absent");
        }

        var user = await userManager.FindByLoginAsync(info.LoginProvider, info.ProviderKey)
            ?? await userManager.FindByEmailAsync(email);

        if (user is not null)
        {
            // An account created with a password, now signing in with the same address through a
            // provider: link the two so the next round trip is a direct hit.
            var logins = await userManager.GetLoginsAsync(user);
            if (!logins.Any(l => l.LoginProvider == info.LoginProvider && l.ProviderKey == info.ProviderKey))
            {
                await userManager.AddLoginAsync(user, new UserLoginInfo(info.LoginProvider, info.ProviderKey, info.ProviderDisplayName));
            }

            var code = CodeProtector.Protect(user.Id.ToString(), CodeLifetime);
            return Redirect($"{FrontendUrl}/connexion/externe?code={Uri.EscapeDataString(code)}");
        }

        // New person: we have a verified identity but no company yet, and a tenant cannot be
        // created without one. Park the identity in a ticket and go ask for the company name.
        var pending = new PendingExternalSignup(
            email,
            info.Principal.FindFirstValue(ClaimTypes.GivenName) ?? string.Empty,
            info.Principal.FindFirstValue(ClaimTypes.Surname) ?? string.Empty,
            info.LoginProvider,
            info.ProviderKey,
            info.ProviderDisplayName);

        var ticket = TicketProtector.Protect(JsonSerializer.Serialize(pending), TicketLifetime);
        return Redirect($"{FrontendUrl}/inscription/finaliser?ticket={Uri.EscapeDataString(ticket)}");
    }

    /// <summary>Called server-side by Next.js to turn the callback's code into a real token.</summary>
    [HttpPost("exchange")]
    public async Task<ActionResult<AuthResponse>> Exchange(ExternalExchangeRequest request)
    {
        string userId;
        try
        {
            userId = CodeProtector.Unprotect(request.Code);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Code de connexion externe invalide ou expiré.");
            return Unauthorized(new { message = "Lien de connexion expiré. Réessayez." });
        }

        var user = await userManager.Users
            .IgnoreQueryFilters()
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Id.ToString() == userId);

        if (user is null) return Unauthorized(new { message = "Compte introuvable." });

        // Minted from the membership like every other sign-in: see IWorkspaceService.HomeMembershipAsync.
        var membership = await workspaces.HomeMembershipAsync(user);
        var token = membership is null
            ? tokenService.CreateAccessToken(user)
            : tokenService.CreateAccessToken(user, membership);
        return Ok(new AuthResponse(token, UserDto.ForHome(user, membership)));
    }

    /// <summary>What the "name your company" page shows, so it can greet the right person.</summary>
    [HttpGet("ticket")]
    public ActionResult<PendingExternalSignupDto> Ticket([FromQuery] string ticket)
    {
        if (!TryReadTicket(ticket, out var pending))
        {
            return Unauthorized(new { message = "Inscription expirée. Recommencez." });
        }

        return Ok(new PendingExternalSignupDto(pending.Email, pending.FirstName, pending.LastName, pending.Provider));
    }

    /// <summary>Finishes a provider sign-up once the company name is known.</summary>
    [HttpPost("register-tenant")]
    public async Task<ActionResult<RegisterTenantResponse>> RegisterTenant(ExternalRegisterTenantRequest request)
    {
        if (!TryReadTicket(request.Ticket, out var pending))
        {
            return Unauthorized(new { message = "Inscription expirée. Recommencez." });
        }

        // Some providers withhold the given/family names; fall back to the address so the
        // account is never created with empty names.
        var firstName = string.IsNullOrWhiteSpace(pending.FirstName)
            ? pending.Email.Split('@')[0]
            : pending.FirstName;

        // Personal sign-up: no company to name the space after, so it takes the person's name.
        // Resolved here rather than in the browser because only the ticket holds these names.
        var isPersonal = string.IsNullOrWhiteSpace(request.CompanyName);
        var spaceName = isPersonal ? $"{firstName} {pending.LastName}".Trim() : request.CompanyName!;

        var result = await tenantSignup.CreateAsync(
            spaceName,
            isPersonal ? TenantKind.Personal : TenantKind.Business,
            request.PlanId,
            firstName,
            pending.LastName,
            pending.Email,
            password: null,
            externalLogin: new UserLoginInfo(pending.Provider, pending.ProviderKey, pending.ProviderDisplayName),
            profile: request.Profile);

        if (!result.Succeeded) return BadRequest(new { message = result.Error });

        return Ok(RegisterTenantResponse.For(result, tokenService));
    }

    private bool TryReadTicket(string ticket, out PendingExternalSignup pending)
    {
        pending = null!;
        try
        {
            var json = TicketProtector.Unprotect(ticket);
            var parsed = JsonSerializer.Deserialize<PendingExternalSignup>(json);
            if (parsed is null) return false;
            pending = parsed;
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Billet d'inscription externe invalide ou expiré.");
            return false;
        }
    }
}
