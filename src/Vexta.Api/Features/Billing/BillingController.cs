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
    string? PlanCurrency,
    /// <summary>
    /// The company asked to stop and is seeing out the period it has paid for. Distinct from a
    /// cancelled subscription: the space still works and the button says "reprendre".
    /// </summary>
    bool CancelAtPeriodEnd,
    /// <summary>
    /// When the free trial runs out, and how many days are left. Both null outside a trial, so
    /// the banner has one thing to test rather than a status string to interpret.
    /// </summary>
    DateTimeOffset? TrialEndsAt,
    int? TrialDaysLeft);

public record UpgradeToBusinessRequest(string CompanyName, Guid PlanId);

/// <summary>The id Stripe appends to the return URL once checkout is finished.</summary>
public record ConfirmCheckoutRequest(string SessionId);

[ApiController]
[Route("api/billing")]
public class BillingController(
    IStripeService stripeService,
    IStripeConnectService connectService,
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
            plan?.Currency,
            tenant.CancelAtPeriodEnd,
            tenant.TrialEndsAt,
            TrialDaysLeft(tenant)));
    }

    /// <summary>
    /// Days left in the trial, counted up rather than down: a trial ending in six hours has one
    /// day left, not zero. Zero would read as "it is over" on the last morning, which is the
    /// morning it matters most that it does not.
    ///
    /// Null once it has actually run out, and null for a space that is not on a trial at all.
    /// </summary>
    private static int? TrialDaysLeft(Tenant tenant)
    {
        if (tenant.SubscriptionStatus != TenantSubscriptionStatus.Trialing) return null;
        if (tenant.TrialEndsAt is not { } ends) return null;

        var remaining = ends - DateTimeOffset.UtcNow;
        return remaining <= TimeSpan.Zero ? 0 : (int)Math.Ceiling(remaining.TotalDays);
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

        return await StartCheckoutAsync(tenant, plan.StripePriceId, null, plan.StripeCouponId);
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
        }, plan.StripeCouponId);
    }

    /// <summary>
    /// Stripe is configured by the platform admin, so it can simply be missing. That is an
    /// outage to report, not an exception to leak.
    /// </summary>
    private async Task<ActionResult<object>> StartCheckoutAsync(
        Tenant tenant,
        string priceId,
        IDictionary<string, string>? metadata,
        string? couponId = null)
    {
        try
        {
            var checkoutUrl = await stripeService.CreateCheckoutSessionAsync(
                tenant,
                CurrentEmail(),
                priceId,
                successUrl: $"{FrontendUrl}/parametres?abonnement=succes&session_id={{CHECKOUT_SESSION_ID}}",
                cancelUrl: $"{FrontendUrl}/parametres",
                sessionMetadata: metadata,
                couponId: couponId);

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
    /// <summary>
    /// Ends the subscription at the end of the period already paid for.
    ///
    /// Nothing is taken away here: the status stays Active and the space keeps working until
    /// Stripe stops it on the date the company has paid up to. The alternative — closing the
    /// doors the moment the button is pressed — would be keeping money for a month nobody got.
    /// </summary>
    [HttpPost("cancel")]
    [Authorize]
    public async Task<IActionResult> Cancel(CancellationToken ct)
    {
        if (!CanManageBilling) return BillingForbidden();

        var tenant = await CurrentTenantAsync();
        if (tenant is null) return NotFound();

        if (string.IsNullOrWhiteSpace(tenant.StripeSubscriptionId))
        {
            return BadRequest(new { message = "Aucun abonnement actif à résilier." });
        }

        try
        {
            var endsOn = await stripeService.SetCancelAtPeriodEndAsync(tenant.StripeSubscriptionId, true, ct);
            tenant.CancelAtPeriodEnd = true;
            if (endsOn is not null) tenant.CurrentPeriodEnd = endsOn;
            await db.SaveChangesAsync(ct);

            return Ok(new
            {
                cancelAtPeriodEnd = true,
                currentPeriodEnd = tenant.CurrentPeriodEnd,
                message = tenant.CurrentPeriodEnd is { } end
                    ? $"Abonnement résilié. Votre espace reste ouvert jusqu'au {end.ToLocalTime():d MMMM yyyy}."
                    : "Abonnement résilié. Votre espace reste ouvert jusqu'à la fin de la période payée."
            });
        }
        catch (StripeException ex)
        {
            logger.LogError(ex, "Résiliation refusée par Stripe pour le locataire {TenantId}.", tenant.Id);
            return BadRequest(new { message = $"Stripe a refusé la résiliation : {ex.StripeError?.Message ?? ex.Message}" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Undoes the above, while the period paid for has not run out.</summary>
    [HttpPost("resume")]
    [Authorize]
    public async Task<IActionResult> Resume(CancellationToken ct)
    {
        if (!CanManageBilling) return BillingForbidden();

        var tenant = await CurrentTenantAsync();
        if (tenant is null) return NotFound();

        if (string.IsNullOrWhiteSpace(tenant.StripeSubscriptionId))
        {
            return BadRequest(new { message = "Aucun abonnement à reprendre." });
        }

        try
        {
            var endsOn = await stripeService.SetCancelAtPeriodEndAsync(tenant.StripeSubscriptionId, false, ct);
            tenant.CancelAtPeriodEnd = false;
            if (endsOn is not null) tenant.CurrentPeriodEnd = endsOn;
            await db.SaveChangesAsync(ct);

            return Ok(new { cancelAtPeriodEnd = false, message = "Abonnement repris." });
        }
        catch (StripeException ex)
        {
            logger.LogError(ex, "Reprise refusée par Stripe pour le locataire {TenantId}.", tenant.Id);
            return BadRequest(new { message = $"Stripe a refusé la reprise : {ex.StripeError?.Message ?? ex.Message}" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

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
    /// The Connect endpoint: what happens on the companies' own Stripe accounts.
    ///
    /// A second endpoint and not a branch of the one above, because Stripe signs the two streams
    /// with different secrets. An account being cleared to take cards and Vexta's own
    /// subscriptions arrive at different URLs, and verifying one with the other's secret fails
    /// every delivery with an error that reads exactly like a forged signature.
    ///
    /// Register it in Stripe as the Connect endpoint, listening for <c>account.updated</c> and
    /// <c>checkout.session.completed</c>.
    /// </summary>
    [HttpPost("webhook/connect")]
    [AllowAnonymous]
    public async Task<IActionResult> ConnectWebhook()
    {
        var payload = await new StreamReader(Request.Body).ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"];

        try
        {
            var stripeEvent = await connectService.ConstructEventAsync(payload, signature!);
            await connectService.ApplyEventAsync(stripeEvent, db, HttpContext.RequestAborted);
            return Ok();
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Webhook Stripe Connect refusé.");
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            // No Connect signing secret yet. A 400 has Stripe queue the deliveries and retry,
            // which is what should happen: a payment recorded by the page the customer landed on
            // is already written, and the account updates arrive once the secret is entered.
            logger.LogWarning(ex, "Webhook Stripe Connect reçu sans secret de signature configuré.");
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
