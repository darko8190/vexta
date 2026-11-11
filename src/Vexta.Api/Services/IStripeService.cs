using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

public interface IStripeService
{
    Task<bool> IsConfiguredAsync(CancellationToken ct = default);
    Task<string> CreateCheckoutSessionAsync(Tenant tenant, string customerEmail, string successUrl, string cancelUrl, CancellationToken ct = default);
    Task<Event> ConstructEventAsync(string payload, string signatureHeader, CancellationToken ct = default);
    Task ApplySubscriptionEventAsync(Event stripeEvent, VextaDbContext db, CancellationToken ct = default);
}

public class StripeService(IPlatformSettingsService settings, ILogger<StripeService> logger) : IStripeService
{
    private async Task<string?> GetSecretKeyAsync(CancellationToken ct) =>
        await settings.GetAsync(PlatformSettingKeys.StripeSecretKey, ct);

    public async Task<bool> IsConfiguredAsync(CancellationToken ct = default)
    {
        var values = await settings.GetManyAsync(
        [
            PlatformSettingKeys.StripeSecretKey,
            PlatformSettingKeys.StripeWebhookSecret,
            PlatformSettingKeys.StripeMonthlyPriceId
        ], ct);
        return values.Values.All(v => !string.IsNullOrWhiteSpace(v));
    }

    public async Task<string> CreateCheckoutSessionAsync(Tenant tenant, string customerEmail, string successUrl, string cancelUrl, CancellationToken ct = default)
    {
        var secretKey = await GetSecretKeyAsync(ct);
        var priceId = await settings.GetAsync(PlatformSettingKeys.StripeMonthlyPriceId, ct);
        if (string.IsNullOrWhiteSpace(secretKey) || string.IsNullOrWhiteSpace(priceId))
        {
            throw new InvalidOperationException("Stripe n'est pas configuré. Contactez l'administrateur de la plateforme.");
        }

        var client = new StripeClient(secretKey);
        var service = new SessionService(client);
        var session = await service.CreateAsync(new SessionCreateOptions
        {
            Mode = "subscription",
            CustomerEmail = customerEmail,
            ClientReferenceId = tenant.Id.ToString(),
            LineItems = [new SessionLineItemOptions { Price = priceId, Quantity = 1 }],
            SuccessUrl = successUrl,
            CancelUrl = cancelUrl,
            SubscriptionData = new SessionSubscriptionDataOptions
            {
                Metadata = new Dictionary<string, string> { ["tenant_id"] = tenant.Id.ToString() }
            }
        }, cancellationToken: ct);

        return session.Url;
    }

    public async Task<Event> ConstructEventAsync(string payload, string signatureHeader, CancellationToken ct)
    {
        var webhookSecret = await settings.GetAsync(PlatformSettingKeys.StripeWebhookSecret, ct);
        if (string.IsNullOrWhiteSpace(webhookSecret))
        {
            throw new InvalidOperationException("Stripe webhook secret n'est pas configuré.");
        }
        return EventUtility.ConstructEvent(payload, signatureHeader, webhookSecret);
    }

    public async Task ApplySubscriptionEventAsync(Event stripeEvent, VextaDbContext db, CancellationToken ct)
    {
        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
            {
                if (stripeEvent.Data.Object is not Session session) return;
                if (!Guid.TryParse(session.ClientReferenceId, out var tenantId)) return;

                var tenant = await db.Tenants.FindAsync([tenantId], ct);
                if (tenant is null) return;

                tenant.StripeCustomerId = session.CustomerId;
                tenant.StripeSubscriptionId = session.SubscriptionId;
                tenant.SubscriptionStatus = TenantSubscriptionStatus.Active;
                await db.SaveChangesAsync(ct);
                break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
            {
                if (stripeEvent.Data.Object is not Subscription subscription) return;
                var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.StripeSubscriptionId == subscription.Id, ct);
                if (tenant is null) return;

                tenant.SubscriptionStatus = subscription.Status switch
                {
                    "active" or "trialing" => TenantSubscriptionStatus.Active,
                    "past_due" or "unpaid" or "incomplete" => TenantSubscriptionStatus.PastDue,
                    _ => TenantSubscriptionStatus.Canceled
                };
                await db.SaveChangesAsync(ct);
                break;
            }
            default:
                logger.LogInformation("Unhandled Stripe event type {Type}", stripeEvent.Type);
                break;
        }
    }
}
