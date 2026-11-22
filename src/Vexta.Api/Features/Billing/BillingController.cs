using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Billing;

public record BillingStateDto(
    string TenantName,
    string Kind,
    string SubscriptionStatus,
    DateTimeOffset? CurrentPeriodEnd,
    bool CanManage,
    string? PlanName,
    long? PlanAmountCents,
    string? PlanCurrency);

public record UpgradeToBusinessRequest(string CompanyName, Guid PlanId);

/// <summary>The id Stripe appends to the return URL once checkout is finished.</summary>
public record ConfirmCheckoutRequest(string SessionId);

[ApiController]
[Route("api/billing")]
public class BillingController(
    IStripeService stripeService,
    VextaDbContext db,
    ICurrentUserService currentUser,
    IConfiguration configuration,
    ILogger<BillingController> logger) : ControllerBase
{
    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    [HttpGet("state")]
    [Authorize]
    public async Task<ActionResult<BillingStateDto>> State()
    {
        var tenant = await CurrentTenantAsync();
        if (tenant is null) return NotFound();

        var plan = tenant.PlanId is null
            ? null
            : await db.Plans.AsNoTracking().FirstOrDefaultAsync(p => p.Id == tenant.PlanId);

        return Ok(new BillingStateDto(
            tenant.Name,
            tenant.Kind.ToString(),
            tenant.SubscriptionStatus.ToString(),
            tenant.CurrentPeriodEnd,
            CanManageBilling,
            plan?.Name,
            plan?.AmountCents,
            plan?.Currency));
    }

    [HttpPost("checkout-session")]
    [Authorize]
    public async Task<ActionResult<object>> CreateCheckoutSession()
    {
        if (!CanManageBilling) return BillingForbidden();

        var tenant = await CurrentTenantAsync();
        if (tenant is null) return NotFound();

        if (tenant.Kind == TenantKind.Personal)
        {
            return BadRequest(new { message = "Un espace personnel est gratuit. Passez à un compte entreprise pour vous abonner." });
        }

        // Two different failures, two different fixes: assign a forfait to the space, or give the
        // forfait a Stripe price. One message for both sends whoever reads it to check the wrong
        // thing — the space looks correctly subscribed while the price is what is missing.
        var plan = tenant.PlanId is null
            ? null
            : await db.Plans.FirstOrDefaultAsync(p => p.Id == tenant.PlanId);

        if (plan is null)
        {
            return BadRequest(new { message = "Aucun forfait n'est rattaché à cet espace. Demandez à l'administrateur de la plateforme de lui en attribuer un." });
        }

        if (string.IsNullOrWhiteSpace(plan.StripePriceId))
        {
            return BadRequest(new { message = $"Le forfait « {plan.Name} » n'a pas de tarif Stripe. L'administrateur de la plateforme doit l'enregistrer avant qu'il puisse être payé." });
        }

        return await StartCheckoutAsync(tenant, plan.StripePriceId, null);
    }

    /// <summary>
    /// Starts the paid upgrade of a personal space. Nothing changes here: the rename and the
    /// switch to a business space happen in the webhook, once Stripe confirms the payment.
    /// </summary>
    [HttpPost("upgrade")]
    [Authorize]
    public async Task<ActionResult<object>> UpgradeToBusiness(UpgradeToBusinessRequest request)
    {
        if (!CanManageBilling) return BillingForbidden();

        if (string.IsNullOrWhiteSpace(request.CompanyName) || request.CompanyName.Trim().Length < 2)
        {
            return BadRequest(new { message = "Le nom de l'entreprise est requis." });
        }

        var tenant = await CurrentTenantAsync();
        if (tenant is null) return NotFound();

        if (tenant.Kind != TenantKind.Personal)
        {
            return BadRequest(new { message = "Cet espace est déjà un compte entreprise." });
        }

        var plan = await db.Plans.FirstOrDefaultAsync(
            p => p.Id == request.PlanId && p.IsPublished && p.StripePriceId != null);

        if (plan is null)
        {
            return BadRequest(new { message = "Ce forfait n'est plus offert. Choisissez-en un autre." });
        }

        return await StartCheckoutAsync(tenant, plan.StripePriceId!, new Dictionary<string, string>
        {
            [StripeService.UpgradeNameKey] = request.CompanyName.Trim(),
            [StripeService.UpgradePlanKey] = plan.Id.ToString()
        });
    }

    /// <summary>
    /// Stripe is configured by the platform admin, so it can simply be missing. That is an
    /// outage to report, not an exception to leak.
    /// </summary>
    private async Task<ActionResult<object>> StartCheckoutAsync(
        Tenant tenant,
        string priceId,
        IDictionary<string, string>? metadata)
    {
        try
        {
            var checkoutUrl = await stripeService.CreateCheckoutSessionAsync(
                tenant,
                CurrentEmail(),
                priceId,
                successUrl: $"{FrontendUrl}/parametres?abonnement=succes&session_id={{CHECKOUT_SESSION_ID}}",
                cancelUrl: $"{FrontendUrl}/parametres",
                sessionMetadata: metadata);

            return Ok(new { checkoutUrl });
        }
        catch (InvalidOperationException ex)
        {
            logger.LogError(ex, "Paiement impossible pour {Tenant}: Stripe n'est pas configuré.", tenant.Slug);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Le paiement est momentanément indisponible. Réessayez plus tard."
            });
        }
        catch (StripeException ex)
        {
            // Stripe's own refusal, passed through rather than flattened into "réessayez plus
            // tard". A rejected price, a key from the wrong account and a malformed return URL
            // all land here, and each one needs a different fix — which the caller cannot guess
            // from a generic message. This used to escape as a 500 with no readable body.
            logger.LogError(ex, "Stripe a refusé la session de paiement de {Tenant}.", tenant.Slug);
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                message = $"Stripe a refusé la demande : {ex.Message}"
            });
        }
    }

    /// <summary>
    /// What the return page calls. Anonymous on purpose: after paying at Stripe, a brand new
    /// company lands back here with no session yet, and bouncing them to a login form while
    /// their space still says "incomplet" is exactly the moment they lose faith in the product.
    ///
    /// Knowing a session id grants nothing: the state applied is whatever Stripe reports for it,
    /// and an unpaid session activates nothing.
    /// </summary>
    [HttpPost("confirm")]
    [AllowAnonymous]
    public async Task<IActionResult> ConfirmCheckout(ConfirmCheckoutRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.SessionId))
        {
            return BadRequest(new { message = "Session de paiement manquante." });
        }

        try
        {
            var tenantId = await stripeService.ConfirmCheckoutSessionAsync(request.SessionId.Trim(), db, ct);
            if (tenantId is null)
            {
                return Ok(new { activated = false, message = "Ce paiement n'est pas encore confirmé par Stripe." });
            }

            return Ok(new { activated = true });
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Confirmation de la session {Session} refusée par Stripe.", request.SessionId);
            return BadRequest(new { message = "Stripe ne reconnaît pas cette session de paiement." });
        }
        catch (InvalidOperationException ex)
        {
            logger.LogError(ex, "Confirmation impossible : Stripe n'est pas configuré.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Le paiement est momentanément indisponible. Réessayez plus tard."
            });
        }
    }

    [HttpPost("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Webhook()
    {
        var payload = await new StreamReader(Request.Body).ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"];

        try
        {
            var stripeEvent = await stripeService.ConstructEventAsync(payload, signature!);
            await stripeService.ApplySubscriptionEventAsync(stripeEvent, db, HttpContext.RequestAborted);
            return Ok();
        }
        catch (StripeException ex)
        {
            // The reason goes in the body on purpose: Stripe shows it in the dashboard next to
            // the failed delivery, which is the only place anyone looks when a webhook fails.
            logger.LogWarning(ex, "Webhook Stripe refusé.");
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            // No signing secret configured yet. A 400 tells Stripe to retry, which is right:
            // the deliveries queue up and go through once the secret is entered.
            logger.LogWarning(ex, "Webhook Stripe reçu sans secret de signature configuré.");
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Who may pay, in one place. A super admin inside a tenant counts as its owner here, as it
    /// does in the sidebar and in the subscription gate — and the state endpoint reports exactly
    /// this, so the button and the endpoint can no longer disagree. They did: the button appeared
    /// for a super admin inside a tenant and the request came back 403 with nothing to read.
    /// </summary>
    private bool CanManageBilling =>
        currentUser.Role == UserRole.TenantAdmin || currentUser.IsImpersonating;

    private ObjectResult BillingForbidden() =>
        StatusCode(StatusCodes.Status403Forbidden, new
        {
            message = "Seul un administrateur de l'entreprise peut gérer l'abonnement."
        });

    private Task<Tenant?> CurrentTenantAsync() =>
        db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == currentUser.TenantId);

    private string CurrentEmail() =>
        User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? string.Empty;
}
