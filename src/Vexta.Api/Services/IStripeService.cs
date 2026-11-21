using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

public interface IStripeService
{
    Task<bool> IsConfiguredAsync(CancellationToken ct = default);

    /// <summary>
    /// Creates the monthly Stripe price a plan will charge. Stripe prices are immutable, so
    /// changing a plan's amount means a new price; subscriptions already running keep billing the
    /// old one until they are migrated in Stripe.
    /// </summary>
    Task<string> CreateRecurringPriceAsync(long amountCents, CancellationToken ct = default);
    /// <summary>
    /// <paramref name="sessionMetadata"/> rides along to the webhook, which is the only place we
    /// learn the payment actually went through.
    /// </summary>
    Task<string> CreateCheckoutSessionAsync(
        Tenant tenant,
        string customerEmail,
        string priceId,
        string successUrl,
        string cancelUrl,
        IDictionary<string, string>? sessionMetadata = null,
        CancellationToken ct = default);
    Task<Event> ConstructEventAsync(string payload, string signatureHeader, CancellationToken ct = default);
    Task ApplySubscriptionEventAsync(Event stripeEvent, VextaDbContext db, CancellationToken ct = default);
}

public class StripeService(IPlatformSettingsService settings, ILogger<StripeService> logger) : IStripeService
{
    /// <summary>Checkout session metadata key carrying the company name of a personal→business upgrade.</summary>
    public const string UpgradeNameKey = "upgrade_company_name";

    /// <summary>Checkout session metadata key carrying the plan chosen for that upgrade.</summary>
    public const string UpgradePlanKey = "upgrade_plan_id";

    private const string Currency = "cad";
    private const string ProductName = "Abonnement Vexta";

    private async Task<string?> GetSecretKeyAsync(CancellationToken ct) =>
        await settings.GetAsync(PlatformSettingKeys.StripeSecretKey, ct);

    public async Task<bool> IsConfiguredAsync(CancellationToken ct = default)
    {
        var values = await settings.GetManyAsync(
        [
            PlatformSettingKeys.StripeSecretKey,
            PlatformSettingKeys.StripeWebhookSecret
        ], ct);
        return values.Values.All(v => !string.IsNullOrWhiteSpace(v));
    }

    public async Task<string> CreateRecurringPriceAsync(long amountCents, CancellationToken ct = default)
    {
        var secretKey = await GetSecretKeyAsync(ct);
        if (string.IsNullOrWhiteSpace(secretKey))
        {
            throw new InvalidOperationException("Ajoutez la clé secrète Stripe avant de fixer un tarif.");
        }

        var client = new StripeClient(secretKey);
        var productId = await settings.GetAsync(PlatformSettingKeys.StripeProductId, ct);
        if (string.IsNullOrWhiteSpace(productId))
        {
            productId = await CreateProductAsync(client, ct);
        }

        Price price;
        try
        {
            price = await CreatePriceAsync(client, productId, amountCents, ct);
        }
        catch (StripeException ex) when (ex.StripeError?.Code == "resource_missing")
        {
            // The stored product belongs to another Stripe account — the usual cause is swapping a
            // test key for a live one. Start a fresh product rather than failing the save.
            logger.LogWarning(ex, "Produit Stripe {ProductId} introuvable; création d'un nouveau produit.", productId);
            productId = await CreateProductAsync(client, ct);
            price = await CreatePriceAsync(client, productId, amountCents, ct);
        }

        logger.LogInformation("Prix Stripe {PriceId} créé pour {AmountCents} {Currency}.", price.Id, amountCents, Currency);
        return price.Id;
    }

    private async Task<string> CreateProductAsync(StripeClient client, CancellationToken ct)
    {
        var product = await new ProductService(client).CreateAsync(
            new ProductCreateOptions { Name = ProductName }, cancellationToken: ct);
        await settings.SetAsync(PlatformSettingKeys.StripeProductId, product.Id, ct);
        return product.Id;
    }

    private static Task<Price> CreatePriceAsync(
        StripeClient client, string productId, long amountCents, CancellationToken ct) =>
        new PriceService(client).CreateAsync(new PriceCreateOptions
        {
            Product = productId,
            Currency = Currency,
            UnitAmount = amountCents,
            Recurring = new PriceRecurringOptions { Interval = "month" }
        }, cancellationToken: ct);

    public async Task<string> CreateCheckoutSessionAsync(
        Tenant tenant,
        string customerEmail,
        string priceId,
        string successUrl,
        string cancelUrl,
        IDictionary<string, string>? sessionMetadata = null,
        CancellationToken ct = default)
    {
        var secretKey = await GetSecretKeyAsync(ct);
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
            Metadata = sessionMetadata is null ? null : new Dictionary<string, string>(sessionMetadata),
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

                // A personal space becomes a business one only once the money has actually
                // arrived — the name and plan were parked in the session when checkout started.
                if (session.Metadata is not null
                    && session.Metadata.TryGetValue(UpgradeNameKey, out var companyName)
                    && !string.IsNullOrWhiteSpace(companyName))
                {
                    tenant.Name = companyName.Trim();
                    tenant.Kind = TenantKind.Business;
                    tenant.Slug = await TenantSlug.UniqueAsync(
                        companyName,
                        candidate => db.Tenants.AnyAsync(t => t.Slug == candidate && t.Id != tenant.Id, ct));

                    if (session.Metadata.TryGetValue(UpgradePlanKey, out var planId)
                        && Guid.TryParse(planId, out var parsedPlanId))
                    {
                        tenant.PlanId = parsedPlanId;
                    }
                }

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
