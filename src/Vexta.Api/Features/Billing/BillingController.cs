using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Billing;

[ApiController]
[Route("api/billing")]
public class BillingController(
    IStripeService stripeService,
    VextaDbContext db,
    ICurrentUserService currentUser,
    IConfiguration configuration,
    ILogger<BillingController> logger) : ControllerBase
{
    [HttpPost("checkout-session")]
    [Authorize(Roles = nameof(UserRole.TenantAdmin))]
    public async Task<ActionResult<object>> CreateCheckoutSession()
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == currentUser.TenantId);
        if (tenant is null) return NotFound();

        var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? string.Empty;
        var frontendUrl = configuration["Frontend:BaseUrl"] ?? "http://localhost:3000";

        var checkoutUrl = await stripeService.CreateCheckoutSessionAsync(
            tenant, email,
            successUrl: $"{frontendUrl}/inscription/succes",
            cancelUrl: $"{frontendUrl}/facturation");

        return Ok(new { checkoutUrl });
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
            logger.LogWarning(ex, "Signature de webhook Stripe invalide.");
            return BadRequest();
        }
    }
}
