using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Features.Orders;

// Stripe has an Invoice of its own, which this file never uses: Vexta raises the invoice and
// Stripe is only asked to take a card against it. Spelled out so the ambiguity cannot be
// resolved the wrong way by a later edit.
using Invoice = Vexta.Api.Domain.Invoice;
using InvoicePayment = Vexta.Api.Domain.InvoicePayment;
using PaymentMethod = Vexta.Api.Domain.PaymentMethod;

namespace Vexta.Api.Services;

/// <summary>
/// What Stripe says about a company's own account, as the screen needs to read it.
/// </summary>
/// <param name="AccountId">Null for a company that has never started.</param>
/// <param name="ChargesEnabled">Money can arrive. The only flag that gates anything.</param>
/// <param name="PayoutsEnabled">Stripe will send it on to the bank.</param>
/// <param name="DetailsSubmitted">Stripe's forms are finished, whatever their verdict is.</param>
public record ConnectAccountState(
    string? AccountId,
    bool ChargesEnabled,
    bool PayoutsEnabled,
    bool DetailsSubmitted);

/// <summary>Where a customer goes to pay for an order, and the session that is waiting there.</summary>
public record OrderCheckout(string Url, string SessionId);

/// <summary>
/// The company's own Stripe account: opening one, finding out whether it can take money, and
/// charging its customers with it.
///
/// Kept apart from <see cref="IStripeService"/> on purpose. That one is Vexta charging the
/// company; this one is the company charging its customers, with money that never touches
/// Vexta's balance. They share nothing but the platform's secret key, and the two were never
/// going to stay readable in one file: every method here takes a <c>Stripe-Account</c> header
/// that every method there must not have.
///
/// Direct charges, not destination charges. The connected account is the merchant of record: the
/// payment appears on the customer's statement under the company's name, the company pays
/// Stripe's fee, and Vexta takes no cut and never holds the funds. That is the arrangement a
/// contractor expects — and the one that keeps Vexta out of being a payment processor.
/// </summary>
public interface IStripeConnectService
{
    /// <summary>
    /// Whether the platform has what it needs for any of this: a Stripe secret key, entered by
    /// a super admin. Without it there is nothing to connect a company to.
    /// </summary>
    Task<bool> IsPlatformReadyAsync(CancellationToken ct = default);

    /// <summary>Whether the Connect endpoint's signing secret has been entered.</summary>
    Task<bool> IsWebhookConfiguredAsync(CancellationToken ct = default);

    /// <summary>
    /// Opens an account for the company if it has none, and hands back the Stripe-hosted page
    /// where it fills in its details. Both URLs are Vexta's; Stripe sends the person back to
    /// one of them and the screen asks Stripe what came of it.
    /// </summary>
    Task<string> StartOnboardingAsync(
        Tenant tenant, string returnUrl, string refreshUrl, VextaDbContext db, CancellationToken ct = default);

    /// <summary>
    /// Asks Stripe what state the account is in and writes the answer onto the tenant.
    ///
    /// Called when the settings screen is opened and when the company comes back from
    /// onboarding, so the three flags are never older than the page showing them.
    /// </summary>
    Task<ConnectAccountState> RefreshAsync(Tenant tenant, VextaDbContext db, CancellationToken ct = default);

    /// <summary>
    /// A single-use link into the company's own Stripe dashboard, where it sees its payments and
    /// its payouts. Null when Stripe refuses one — an account that has not finished onboarding
    /// has no dashboard yet.
    /// </summary>
    Task<string?> DashboardLinkAsync(Tenant tenant, CancellationToken ct = default);

    /// <summary>
    /// The hosted page where a customer pays one invoice by card, charged on the company's own
    /// account. <paramref name="amountDue"/> is what is still owed, not the invoice total.
    /// </summary>
    Task<string> CreateInvoiceCheckoutSessionAsync(
        Tenant tenant,
        Invoice invoice,
        decimal amountDue,
        string successUrl,
        string cancelUrl,
        CancellationToken ct = default);

    /// <summary>
    /// The hosted page where a customer pays for one order, charged on the company's own
    /// account, and the id of the session it opened.
    ///
    /// The session id comes back because an order keeps it: a Stripe session expires, and a
    /// customer who comes back a day later has to be given a new page rather than a dead link.
    /// </summary>
    Task<OrderCheckout> CreateOrderCheckoutSessionAsync(
        Tenant tenant,
        CustomerOrder order,
        decimal amount,
        string successUrl,
        string cancelUrl,
        CancellationToken ct = default);

    /// <summary>
    /// Reads a finished order checkout back from Stripe and settles the order, so the page the
    /// customer lands on says "payée" without waiting for a webhook. Safe to run after the
    /// webhook has already run.
    /// </summary>
    /// <returns>True when the order is paid.</returns>
    Task<bool> ConfirmOrderPaymentAsync(
        string sessionId, Tenant tenant, VextaDbContext db, CancellationToken ct = default);

    /// <summary>
    /// Sends a card payment back the way it came, and hands back the id Stripe gives the refund.
    ///
    /// Charging being enabled is deliberately not required. A company whose account has stopped
    /// taking payments -- a document expired, a verification lapsed -- still has to be able to
    /// give money back, and that is the moment it most needs to.
    /// </summary>
    Task<string> RefundAsync(
        Tenant tenant, string paymentIntentId, decimal amount, CancellationToken ct = default);

    /// <summary>
    /// Verifies a delivery from the Connect endpoint, which signs with its own secret — see
    /// <see cref="PlatformSettingKeys.StripeConnectWebhookSecret"/>.
    /// </summary>
    Task<Event> ConstructEventAsync(string payload, string signatureHeader, CancellationToken ct = default);

    Task ApplyEventAsync(Event stripeEvent, VextaDbContext db, CancellationToken ct = default);

    /// <summary>
    /// Reads a finished checkout session back from Stripe and records the payment, so the page a
    /// customer lands on says "payé" without waiting for a webhook. Safe to run after the
    /// webhook has already run: the payment is written once.
    /// </summary>
    /// <returns>True when the invoice has a payment recorded for this session.</returns>
    Task<bool> ConfirmInvoicePaymentAsync(
        string sessionId, Tenant tenant, VextaDbContext db, CancellationToken ct = default);
}

public class StripeConnectService(
    IPlatformSettingsService settings,
    ILogger<StripeConnectService> logger) : IStripeConnectService
{
    /// <summary>Checkout metadata key carrying the invoice being paid, for the webhook.</summary>
    private const string InvoiceKey = "invoice_id";

    /// <summary>
    /// Checkout metadata key carrying the order being paid. Its presence is what tells the two
    /// kinds of session apart: an invoice is paid under <see cref="InvoiceKey"/>, an order here.
    /// </summary>
    private const string OrderKey = "order_id";

    private async Task<string> RequireSecretKeyAsync(CancellationToken ct)
    {
        var key = await settings.GetAsync(PlatformSettingKeys.StripeSecretKey, ct);
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException(
                "Les paiements en ligne ne sont pas configurés sur la plateforme. Contactez Vexta.");
        }
        return key;
    }

    public async Task<bool> IsPlatformReadyAsync(CancellationToken ct = default) =>
        !string.IsNullOrWhiteSpace(await settings.GetAsync(PlatformSettingKeys.StripeSecretKey, ct));

    public async Task<bool> IsWebhookConfiguredAsync(CancellationToken ct = default) =>
        !string.IsNullOrWhiteSpace(await settings.GetAsync(PlatformSettingKeys.StripeConnectWebhookSecret, ct));

    public async Task<string> StartOnboardingAsync(
        Tenant tenant, string returnUrl, string refreshUrl, VextaDbContext db, CancellationToken ct = default)
    {
        var client = new StripeClient(await RequireSecretKeyAsync(ct));

        if (string.IsNullOrWhiteSpace(tenant.StripeAccountId))
        {
            tenant.StripeAccountId = await CreateAccountAsync(client, tenant, db, ct);
            // Saved before the link is asked for. An account created at Stripe and not written
            // down here is an account nobody can reach again: the company would start over and
            // leave an orphan behind, and Stripe's own duplicate checks would start refusing.
            await db.SaveChangesAsync(ct);
        }

        try
        {
            return await CreateAccountLinkAsync(client, tenant.StripeAccountId!, returnUrl, refreshUrl, ct);
        }
        catch (StripeException ex) when (ex.StripeError?.Code == "resource_missing")
        {
            // The stored account belongs to another Stripe account — the usual cause is the
            // platform swapping a test key for a live one. Open a fresh one rather than leaving
            // the company stuck on a button that always fails.
            logger.LogWarning(ex,
                "Compte Stripe {Account} introuvable pour {Tenant}; création d'un nouveau compte.",
                tenant.StripeAccountId, tenant.Id);

            tenant.StripeAccountId = await CreateAccountAsync(client, tenant, db, ct);
            tenant.StripeChargesEnabled = false;
            tenant.StripePayoutsEnabled = false;
            tenant.StripeDetailsSubmitted = false;
            await db.SaveChangesAsync(ct);

            return await CreateAccountLinkAsync(client, tenant.StripeAccountId!, returnUrl, refreshUrl, ct);
        }
    }

    private async Task<string> CreateAccountAsync(
        StripeClient client, Tenant tenant, VextaDbContext db, CancellationToken ct)
    {
        // Stripe fixes a connected account's country at creation and will not change it
        // afterwards, so it is taken from the address the company registered rather than
        // assumed. A company with no address is stopped here, where the message can say what to
        // do, instead of opening a Canadian account for a business in Ontario's neighbour.
        var country = await CountryOfAsync(tenant, db, ct)
            ?? throw new InvalidOperationException(
                "Ajoutez l'adresse de votre entreprise avant de brancher Stripe : "
                + "le pays d'un compte Stripe ne peut plus être changé par la suite.");

        var account = await new AccountService(client).CreateAsync(new AccountCreateOptions
        {
            Country = country,
            Email = string.IsNullOrWhiteSpace(tenant.ContactEmail) ? null : tenant.ContactEmail,
            BusinessProfile = new AccountBusinessProfileOptions { Name = tenant.Name },
            Capabilities = new AccountCapabilitiesOptions
            {
                CardPayments = new AccountCapabilitiesCardPaymentsOptions { Requested = true },
                Transfers = new AccountCapabilitiesTransfersOptions { Requested = true }
            },
            // An Express account: Stripe collects the company's details, runs the verification
            // and hosts the dashboard where it watches its own money. Vexta asks for none of it,
            // which is the point — a contractor's banking details and identity documents have no
            // business passing through this application.
            Controller = new AccountControllerOptions
            {
                StripeDashboard = new AccountControllerStripeDashboardOptions { Type = "express" },
                Fees = new AccountControllerFeesOptions { Payer = "account" },
                Losses = new AccountControllerLossesOptions { Payments = "stripe" },
                RequirementCollection = "stripe"
            },
            Metadata = new Dictionary<string, string> { ["tenant_id"] = tenant.Id.ToString() }
        }, cancellationToken: ct);

        logger.LogInformation(
            "Compte Stripe connecté {Account} créé pour {Tenant} ({Country}).", account.Id, tenant.Id, country);

        return account.Id;
    }

    /// <summary>
    /// The ISO code of the country on the company's main address, or null when it has none.
    /// Any location will do if none is marked as the main one — a company with one address and
    /// nobody having pressed the star still has a country.
    /// </summary>
    private static async Task<string?> CountryOfAsync(Tenant tenant, VextaDbContext db, CancellationToken ct)
    {
        var name = await db.CompanyLocations.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.TenantId == tenant.Id)
            .OrderByDescending(l => l.IsPrimary)
            .Select(l => l.Country)
            .FirstOrDefaultAsync(ct);

        return CountryCodes.Of(name);
    }

    private static async Task<string> CreateAccountLinkAsync(
        StripeClient client, string accountId, string returnUrl, string refreshUrl, CancellationToken ct)
    {
        var link = await new AccountLinkService(client).CreateAsync(new AccountLinkCreateOptions
        {
            Account = accountId,
            Type = "account_onboarding",
            ReturnUrl = returnUrl,
            RefreshUrl = refreshUrl
        }, cancellationToken: ct);

        return link.Url;
    }

    public async Task<ConnectAccountState> RefreshAsync(
        Tenant tenant, VextaDbContext db, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenant.StripeAccountId))
        {
            return new ConnectAccountState(null, false, false, false);
        }

        var client = new StripeClient(await RequireSecretKeyAsync(ct));

        Account account;
        try
        {
            account = await new AccountService(client).GetAsync(tenant.StripeAccountId, cancellationToken: ct);
        }
        catch (StripeException ex) when (ex.StripeError?.Code == "resource_missing")
        {
            // The account is gone, or the platform's keys now point at a different Stripe
            // account. Forget it so the company can start again, rather than leaving a screen
            // that says "connecté" above a button that cannot charge anything.
            logger.LogWarning(ex,
                "Compte Stripe {Account} de {Tenant} introuvable; lien oublié.", tenant.StripeAccountId, tenant.Id);

            tenant.StripeAccountId = null;
            tenant.StripeChargesEnabled = false;
            tenant.StripePayoutsEnabled = false;
            tenant.StripeDetailsSubmitted = false;
            tenant.StripeAccountCheckedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            return new ConnectAccountState(null, false, false, false);
        }

        tenant.StripeChargesEnabled = account.ChargesEnabled;
        tenant.StripePayoutsEnabled = account.PayoutsEnabled;
        tenant.StripeDetailsSubmitted = account.DetailsSubmitted;
        tenant.StripeAccountCheckedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return new ConnectAccountState(
            account.Id, account.ChargesEnabled, account.PayoutsEnabled, account.DetailsSubmitted);
    }

    public async Task<string?> DashboardLinkAsync(Tenant tenant, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenant.StripeAccountId)) return null;

        try
        {
            var client = new StripeClient(await RequireSecretKeyAsync(ct));
            var link = await new AccountLoginLinkService(client)
                .CreateAsync(tenant.StripeAccountId, cancellationToken: ct);
            return link.Url;
        }
        catch (StripeException ex)
        {
            // An account part-way through onboarding has no dashboard to log into. Not an error
            // worth showing: the card simply does not offer the link.
            logger.LogInformation(ex,
                "Pas de lien de tableau de bord Stripe pour {Account}.", tenant.StripeAccountId);
            return null;
        }
    }

    public async Task<string> CreateInvoiceCheckoutSessionAsync(
        Tenant tenant,
        Invoice invoice,
        decimal amountDue,
        string successUrl,
        string cancelUrl,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenant.StripeAccountId) || !tenant.StripeChargesEnabled)
        {
            throw new InvalidOperationException("Cette entreprise n'accepte pas encore les paiements en ligne.");
        }

        if (amountDue <= 0)
        {
            throw new InvalidOperationException("Cette facture est déjà réglée.");
        }

        var client = new StripeClient(await RequireSecretKeyAsync(ct));

        var session = await new SessionService(client).CreateAsync(new SessionCreateOptions
        {
            Mode = "payment",
            SuccessUrl = successUrl,
            CancelUrl = cancelUrl,
            // What the webhook matches the money back to. The metadata carries the same thing,
            // because a session read back from Stripe is easier to reason about when the answer
            // is in two places than when a future change to one of them loses it.
            ClientReferenceId = invoice.Id.ToString(),
            Metadata = new Dictionary<string, string>
            {
                [InvoiceKey] = invoice.Id.ToString(),
                ["invoice_number"] = invoice.Number
            },
            LineItems =
            [
                new SessionLineItemOptions
                {
                    Quantity = 1,
                    PriceData = new SessionLineItemPriceDataOptions
                    {
                        Currency = (invoice.Currency ?? "CAD").ToLowerInvariant(),
                        // Cents, rounded the way the invoice itself rounds. Stripe takes an
                        // integer and nothing else: a half-cent has to land somewhere, and it
                        // lands where the printed total already put it.
                        UnitAmount = (long)decimal.Round(amountDue * 100m, 0, MidpointRounding.AwayFromZero),
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = $"Facture {invoice.Number}",
                            Description = tenant.Name
                        }
                    }
                }
            ]
        }, new RequestOptions { StripeAccount = tenant.StripeAccountId }, ct);

        return session.Url;
    }

    public async Task<OrderCheckout> CreateOrderCheckoutSessionAsync(
        Tenant tenant,
        CustomerOrder order,
        decimal amount,
        string successUrl,
        string cancelUrl,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenant.StripeAccountId) || !tenant.StripeChargesEnabled)
        {
            throw new InvalidOperationException("Cette entreprise n'accepte pas encore les paiements en ligne.");
        }

        if (amount <= 0)
        {
            throw new InvalidOperationException("Cette commande n'a rien à payer.");
        }

        var client = new StripeClient(await RequireSecretKeyAsync(ct));

        var session = await new SessionService(client).CreateAsync(new SessionCreateOptions
        {
            Mode = "payment",
            SuccessUrl = successUrl,
            CancelUrl = cancelUrl,
            // The customer's address, so the receipt Stripe sends goes somewhere.
            CustomerEmail = string.IsNullOrWhiteSpace(order.ContactEmail) ? null : order.ContactEmail,
            ClientReferenceId = order.Id.ToString(),
            Metadata = new Dictionary<string, string>
            {
                [OrderKey] = order.Id.ToString(),
                ["order_number"] = OrderNumber.Of(order.Number)
            },
            LineItems =
            [
                new SessionLineItemOptions
                {
                    Quantity = 1,
                    PriceData = new SessionLineItemPriceDataOptions
                    {
                        Currency = (order.Currency ?? "CAD").ToLowerInvariant(),
                        // One line for the whole order rather than one per article, exactly as
                        // an invoice is charged as one figure. The customer saw the detail in
                        // the basket and keeps it in Mes commandes; splitting it here would put
                        // the taxes somewhere, and the total Stripe charges has to be the total
                        // that was accepted, to the cent.
                        UnitAmount = (long)decimal.Round(amount * 100m, 0, MidpointRounding.AwayFromZero),
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = $"Commande {OrderNumber.Of(order.Number)}",
                            Description = tenant.Name
                        }
                    }
                }
            ]
        }, new RequestOptions { StripeAccount = tenant.StripeAccountId }, ct);

        return new OrderCheckout(session.Url, session.Id);
    }

    public async Task<string> RefundAsync(
        Tenant tenant, string paymentIntentId, decimal amount, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenant.StripeAccountId))
        {
            throw new InvalidOperationException("Cette entreprise n'a pas de compte Stripe branché.");
        }

        if (amount <= 0)
        {
            throw new InvalidOperationException("Le montant à rembourser doit être positif.");
        }

        var client = new StripeClient(await RequireSecretKeyAsync(ct));

        // On the connected account, because that is where the charge was made. The platform
        // took no fee on it, so there is no application fee to give back alongside.
        var refund = await new RefundService(client).CreateAsync(
            new RefundCreateOptions
            {
                PaymentIntent = paymentIntentId,
                // Cents, rounded the way the invoice rounds. Stripe takes an integer and
                // nothing else.
                Amount = (long)decimal.Round(amount * 100m, 0, MidpointRounding.AwayFromZero)
            },
            new RequestOptions { StripeAccount = tenant.StripeAccountId },
            ct);

        logger.LogInformation(
            "Remboursement Stripe {Refund} de {Amount} sur {Intent} ({Account}).",
            refund.Id, amount, paymentIntentId, tenant.StripeAccountId);

        return refund.Id;
    }

    public async Task<Event> ConstructEventAsync(
        string payload, string signatureHeader, CancellationToken ct = default)
    {
        var secret = await settings.GetAsync(PlatformSettingKeys.StripeConnectWebhookSecret, ct);
        if (string.IsNullOrWhiteSpace(secret))
        {
            throw new InvalidOperationException("Le secret du webhook Stripe Connect n'est pas configuré.");
        }

        // Same reasoning as the subscription webhook: the version check is waived, the signature
        // is not. An account pinned to an older API version would otherwise have every delivery
        // refused with an error that reads exactly like a forged signature.
        return EventUtility.ConstructEvent(payload, signatureHeader, secret, throwOnApiVersionMismatch: false);
    }

    public async Task ApplyEventAsync(Event stripeEvent, VextaDbContext db, CancellationToken ct = default)
    {
        switch (stripeEvent.Type)
        {
            case "account.updated":
            {
                if (stripeEvent.Data.Object is not Account account) return;

                var tenant = await db.Tenants.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(t => t.StripeAccountId == account.Id, ct);
                if (tenant is null) return;

                tenant.StripeChargesEnabled = account.ChargesEnabled;
                tenant.StripePayoutsEnabled = account.PayoutsEnabled;
                tenant.StripeDetailsSubmitted = account.DetailsSubmitted;
                tenant.StripeAccountCheckedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
                break;
            }
            case "checkout.session.completed":
            {
                if (stripeEvent.Data.Object is not Session session) return;

                // The account the charge was made on. Without it there is nothing tying the
                // money to a company, and an event could credit somebody else's invoice.
                if (string.IsNullOrWhiteSpace(stripeEvent.Account)) return;

                // Which of the two things was paid, decided by the key the session carries
                // rather than by trying one and falling through to the other: a session that
                // matched nothing would otherwise be indistinguishable from one that failed.
                if (IsOrderSession(session))
                {
                    await RecordOrderPaymentAsync(session, stripeEvent.Account, db, ct);
                }
                else
                {
                    await RecordInvoicePaymentAsync(session, stripeEvent.Account, db, ct);
                }

                break;
            }
            default:
                logger.LogInformation("Évènement Stripe Connect non traité : {Type}", stripeEvent.Type);
                break;
        }
    }

    public async Task<bool> ConfirmInvoicePaymentAsync(
        string sessionId, Tenant tenant, VextaDbContext db, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenant.StripeAccountId)) return false;

        var client = new StripeClient(await RequireSecretKeyAsync(ct));

        // Read on the connected account, because that is where the session was created. Asking
        // the platform for it returns nothing at all.
        var session = await new SessionService(client).GetAsync(
            sessionId,
            requestOptions: new RequestOptions { StripeAccount = tenant.StripeAccountId },
            cancellationToken: ct);

        return await RecordInvoicePaymentAsync(session, tenant.StripeAccountId, db, ct);
    }

    /// <summary>
    /// Writes the payment a finished session represents, once.
    ///
    /// Shared by the webhook and the page the customer lands on, which race each other by
    /// design: whichever arrives first records it and the other finds it already there. The
    /// payment intent's id is what makes that safe — it is the same id in both, so the second
    /// caller recognises its own row rather than adding a duplicate.
    /// </summary>
    private async Task<bool> RecordInvoicePaymentAsync(
        Session session, string accountId, VextaDbContext db, CancellationToken ct)
    {
        // Stripe is the authority on whether the money arrived, not the browser that came back.
        if (session.Status != "complete") return false;
        if (session.PaymentStatus is not ("paid" or "no_payment_required")) return false;

        var rawInvoiceId = session.ClientReferenceId
            ?? (session.Metadata is not null && session.Metadata.TryGetValue(InvoiceKey, out var fromMetadata)
                ? fromMetadata
                : null);

        if (!Guid.TryParse(rawInvoiceId, out var invoiceId)) return false;

        var invoice = await db.Invoices.IgnoreQueryFilters()
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, ct);
        if (invoice is null) return false;

        // The company that owns the invoice must be the company that was paid. Without this
        // check an event from any connected account could settle any invoice in the platform,
        // because the invoice id travels in metadata a caller controls.
        var owns = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .AnyAsync(t => t.Id == invoice.TenantId && t.StripeAccountId == accountId, ct);
        if (!owns)
        {
            logger.LogWarning(
                "Session Stripe {Session} du compte {Account} refusée : la facture {Invoice} appartient à une autre entreprise.",
                session.Id, accountId, invoiceId);
            return false;
        }

        var reference = session.PaymentIntentId ?? session.Id;

        var already = await db.InvoicePayments.IgnoreQueryFilters()
            .AnyAsync(p => p.InvoiceId == invoiceId && p.Reference == reference, ct);
        if (already) return true;

        var amount = InvoiceTotals.Round((decimal)(session.AmountTotal ?? 0L) / 100m);
        if (amount <= 0) return false;

        db.InvoicePayments.Add(new InvoicePayment
        {
            TenantId = invoice.TenantId,
            InvoiceId = invoiceId,
            // The day the money arrived, read the same way every other payment in the
            // application reads it, so an online card and one entered at the counter land in the
            // same day's takings.
            Date = DateOnly.FromDateTime(DateTime.Now),
            Amount = amount,
            Method = PaymentMethod.Carte,
            Reference = reference,
            Note = "Payé en ligne"
            // No CreatedByUserId: nobody at the company entered this. A user id here would put
            // somebody's name on a payment they had nothing to do with.
        });

        var billing = await db.BillingSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == invoice.TenantId, ct);

        var total = InvoiceTotals.For(invoice.Lines, billing, invoice.IsTaxExempt).Total;

        var takenBefore = await db.InvoicePayments.IgnoreQueryFilters()
            .Where(p => p.InvoiceId == invoiceId)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;

        var paidBefore = InvoiceSettlement.Net(
            takenBefore,
            await InvoiceSettlement.RefundedAsync(db.InvoiceRefunds.IgnoreQueryFilters(), invoiceId, ct));

        var credited = await InvoiceSettlement.CreditedAsync(
            db.InvoiceCredits.IgnoreQueryFilters(), invoiceId, ct);

        InvoiceStatusRules.ApplyPaid(invoice, paidBefore + amount, total, credited);

        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Paiement en ligne de {Amount} enregistré sur la facture {Invoice}.", amount, invoiceId);

        return true;
    }

    public async Task<bool> ConfirmOrderPaymentAsync(
        string sessionId, Tenant tenant, VextaDbContext db, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenant.StripeAccountId)) return false;

        var client = new StripeClient(await RequireSecretKeyAsync(ct));

        // Read on the connected account, because that is where the session was created.
        var session = await new SessionService(client).GetAsync(
            sessionId,
            requestOptions: new RequestOptions { StripeAccount = tenant.StripeAccountId },
            cancellationToken: ct);

        return await RecordOrderPaymentAsync(session, tenant.StripeAccountId, db, ct);
    }

    private static bool IsOrderSession(Session session) =>
        session.Metadata is not null && session.Metadata.ContainsKey(OrderKey);

    /// <summary>
    /// Settles the order a finished session paid for, once.
    ///
    /// Shared by the webhook and the page the customer lands on, which race each other by
    /// design. PaidAt is what makes that safe: whichever arrives first writes it, and the
    /// second finds the order already settled and says so rather than charging the books twice.
    /// </summary>
    private async Task<bool> RecordOrderPaymentAsync(
        Session session, string accountId, VextaDbContext db, CancellationToken ct)
    {
        // Stripe is the authority on whether the money arrived, not the browser that came back.
        if (session.Status != "complete") return false;
        if (session.PaymentStatus is not ("paid" or "no_payment_required")) return false;

        var rawOrderId = session.Metadata is not null && session.Metadata.TryGetValue(OrderKey, out var fromMetadata)
            ? fromMetadata
            : session.ClientReferenceId;

        if (!Guid.TryParse(rawOrderId, out var orderId)) return false;

        var order = await db.CustomerOrders.IgnoreQueryFilters()
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null) return false;

        // The company that owns the order must be the company that was paid. Without this check
        // an event from any connected account could settle any order in the platform, because
        // the order id travels in metadata a caller controls.
        var owns = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .AnyAsync(t => t.Id == order.TenantId && t.StripeAccountId == accountId, ct);
        if (!owns)
        {
            logger.LogWarning(
                "Session Stripe {Session} du compte {Account} refusée : la commande {Order} appartient à une autre entreprise.",
                session.Id, accountId, orderId);
            return false;
        }

        if (order.PaidAt is not null) return true;

        var amount = InvoiceTotals.Round((decimal)(session.AmountTotal ?? 0L) / 100m);
        if (amount <= 0) return false;

        var reference = session.PaymentIntentId ?? session.Id;

        order.PaidAt = DateTimeOffset.UtcNow;
        order.AmountPaid = amount;
        order.StripePaymentReference = reference;
        // Only now is it an order. Until the card went through it was a checkout somebody had
        // open, and the company's order book never saw it.
        order.Status = CustomerOrderStatus.Recue;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        await InvoicePaidOrderAsync(order, amount, reference, db, ct);

        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Commande {Order} payée en ligne : {Amount}.", OrderNumber.Of(order.Number), amount);

        return true;
    }

    /// <summary>
    /// Puts the paid order in the company's invoice book, already settled.
    ///
    /// Here rather than left for somebody to press a button: the money has arrived, and an
    /// invoice nobody raised is a sale missing from the books and a customer with no receipt.
    /// The number is taken now rather than when the checkout opened, so a customer who walks
    /// away from the payment page never burns an invoice number.
    ///
    /// A company with no billing settings yet keeps its money and its order; the invoice simply
    /// is not raised, and the Facturer button still works afterwards. Refusing the payment over
    /// a missing prefix would be refusing a sale.
    /// </summary>
    private async Task InvoicePaidOrderAsync(
        CustomerOrder order, decimal amount, string reference, VextaDbContext db, CancellationToken ct)
    {
        if (order.InvoiceId is not null) return;

        var client = await db.Clients.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == order.ClientId, ct);

        var settings = await db.BillingSettings.IgnoreQueryFilters()
            .FirstOrDefaultAsync(b => b.TenantId == order.TenantId, ct);

        if (client is null || settings is null)
        {
            logger.LogWarning(
                "Commande {Order} payée mais non facturée : paramètres de facturation ou client manquants.",
                order.Id);
            return;
        }

        var invoice = OrderInvoicing.Build(order, client, settings, InvoiceStatus.Envoyee);

        db.Invoices.Add(invoice);
        order.InvoiceId = invoice.Id;

        db.InvoicePayments.Add(new InvoicePayment
        {
            TenantId = order.TenantId,
            InvoiceId = invoice.Id,
            Date = DateOnly.FromDateTime(DateTime.Now),
            Amount = amount,
            Method = PaymentMethod.Carte,
            Reference = reference,
            Note = "Payé en ligne à la commande"
            // No CreatedByUserId: nobody at the company entered this.
        });

        // The invoice's taxes are worked out from the company's settings as they stand today,
        // while the amount charged used the rates the order froze. They are the same figure
        // unless the company changed its rates between the two, in which case the invoice shows
        // a partial payment or a small credit -- which is the truth, and visible, rather than a
        // total quietly restated to match what was taken.
        var total = InvoiceTotals.For(invoice.Lines, settings, invoice.IsTaxExempt).Total;
        // Built a moment ago from the order, so nothing can have credited it yet.
        InvoiceStatusRules.ApplyPaid(invoice, amount, total, credited: 0m);
    }
}
