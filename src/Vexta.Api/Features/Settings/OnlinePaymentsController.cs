using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Settings;

/// <summary>
/// Where the company stands with its own Stripe account, as its settings screen needs it.
/// </summary>
/// <param name="Included">The feature is on the company's plan.</param>
/// <param name="PlatformReady">Vexta has a Stripe secret key. Nothing works without it.</param>
/// <param name="WebhookConfigured">
/// The Connect endpoint's signing secret is entered. Payments still work without it — the page
/// the customer lands on records them — but an account verified overnight would not be noticed
/// until somebody opened this screen, so it is worth saying.
/// </param>
/// <param name="AddressMissing">
/// The company has no address with a country Stripe can be told. Said before the button is
/// pressed, because a connected account's country cannot be changed afterwards.
/// </param>
public record OnlinePaymentsStateDto(
    bool Included,
    bool PlatformReady,
    bool WebhookConfigured,
    bool CanManage,
    bool AddressMissing,
    bool Connected,
    bool ChargesEnabled,
    bool PayoutsEnabled,
    bool DetailsSubmitted,
    DateTimeOffset? CheckedAt);

/// <summary>
/// Connecting the company's own Stripe account, so it gets paid by its customers.
///
/// Owner only. Where a company's money arrives is not something an employee or a chargé de
/// projet decides, and the onboarding link leads to a page that asks for banking details.
///
/// Every endpoint here checks the feature for itself rather than trusting the screen: the state
/// endpoint reports whether it is included and the two that do something refuse without it.
/// </summary>
[ApiController]
[Route("api/paiements-en-ligne")]
[Authorize(Roles = Roles.Owner)]
public class OnlinePaymentsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IFeatureService features,
    IStripeConnectService connect,
    IConfiguration configuration,
    ILogger<OnlinePaymentsController> logger) : ControllerBase
{
    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    [HttpGet("etat")]
    public async Task<ActionResult<OnlinePaymentsStateDto>> State(CancellationToken ct)
    {
        var tenant = await CurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        var included = await features.IsEnabledAsync(FeatureKeys.Payments, ct);
        var platformReady = await connect.IsPlatformReadyAsync(ct);

        return Ok(new OnlinePaymentsStateDto(
            Included: included,
            PlatformReady: platformReady,
            WebhookConfigured: await connect.IsWebhookConfiguredAsync(ct),
            CanManage: true,
            AddressMissing: await CountryMissingAsync(tenant.Id, ct),
            Connected: tenant.StripeAccountId is not null,
            ChargesEnabled: tenant.StripeChargesEnabled,
            PayoutsEnabled: tenant.StripePayoutsEnabled,
            DetailsSubmitted: tenant.StripeDetailsSubmitted,
            CheckedAt: tenant.StripeAccountCheckedAt));
    }

    /// <summary>
    /// Opens the company's account if it has none and hands back the Stripe page to finish it.
    ///
    /// Stripe is given two URLs back into Vexta: one for when the person finishes or abandons,
    /// and one for when the link has gone stale, which Stripe's own instructions say must lead
    /// somewhere that makes a fresh link. Both land on the settings screen, which asks Stripe
    /// what came of it rather than believing the query string.
    /// </summary>
    [HttpPost("onboarding")]
    public async Task<ActionResult<object>> StartOnboarding(CancellationToken ct)
    {
        if (!await features.IsEnabledAsync(FeatureKeys.Payments, ct)) return FeatureMissing();

        var tenant = await CurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        if (tenant.Kind != TenantKind.Business)
        {
            return BadRequest(new
            {
                message = "Les paiements en ligne sont réservés aux comptes entreprise."
            });
        }

        try
        {
            var url = await connect.StartOnboardingAsync(
                tenant,
                returnUrl: $"{FrontendUrl}/parametres?paiements=retour",
                refreshUrl: $"{FrontendUrl}/parametres?paiements=reprendre",
                db,
                ct);

            return Ok(new { url });
        }
        catch (StripeException ex)
        {
            // Stripe's own wording, which says which detail it refused. Replacing it with
            // "réessayez" sends somebody back to press a button that will fail the same way.
            logger.LogWarning(ex, "Stripe a refusé l'ouverture du compte de {Tenant}.", tenant.Id);
            return BadRequest(new
            {
                message = $"Stripe a refusé : {ex.StripeError?.Message ?? ex.Message}"
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Asks Stripe where the account stands now, rather than trusting what was cached.</summary>
    [HttpPost("actualiser")]
    public async Task<ActionResult<OnlinePaymentsStateDto>> Refresh(CancellationToken ct)
    {
        if (!await features.IsEnabledAsync(FeatureKeys.Payments, ct)) return FeatureMissing();

        var tenant = await CurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        try
        {
            await connect.RefreshAsync(tenant, db, ct);
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Stripe n'a pas répondu pour le compte de {Tenant}.", tenant.Id);
            return BadRequest(new { message = "Stripe n'a pas répondu. Réessayez dans un instant." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        return await State(ct);
    }

    /// <summary>
    /// A one-time link into the company's own Stripe dashboard, where it sees its payments and
    /// its payouts. POST rather than GET because each call makes a new single-use link.
    /// </summary>
    [HttpPost("tableau-de-bord")]
    public async Task<ActionResult<object>> Dashboard(CancellationToken ct)
    {
        if (!await features.IsEnabledAsync(FeatureKeys.Payments, ct)) return FeatureMissing();

        var tenant = await CurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        var url = await connect.DashboardLinkAsync(tenant, ct);
        if (url is null)
        {
            return BadRequest(new
            {
                message = "Votre tableau de bord Stripe n'est pas encore accessible. Terminez d'abord l'inscription."
            });
        }

        return Ok(new { url });
    }

    private ObjectResult FeatureMissing() =>
        StatusCode(StatusCodes.Status402PaymentRequired, new
        {
            message = "Les paiements en ligne ne sont pas inclus dans votre forfait."
        });

    /// <summary>
    /// True when no address of the company resolves to a country code. Read with the query
    /// filters on, because this one does run with a tenant in hand.
    /// </summary>
    private async Task<bool> CountryMissingAsync(Guid tenantId, CancellationToken ct)
    {
        var names = await db.CompanyLocations.AsNoTracking()
            .Where(l => l.TenantId == tenantId)
            .Select(l => l.Country)
            .ToListAsync(ct);

        return names.All(name => CountryCodes.Of(name) is null);
    }

    private Task<Tenant?> CurrentTenantAsync(CancellationToken ct) =>
        db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == currentUser.TenantId, ct);
}
