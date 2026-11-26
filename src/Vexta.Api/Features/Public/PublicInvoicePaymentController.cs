using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Services;

// Stripe's own Invoice type is never meant here: the invoice is Vexta's, and Stripe only takes
// the card against it.
using Invoice = Vexta.Api.Domain.Invoice;

namespace Vexta.Api.Features.Public;

/// <summary>
/// One invoice as the customer holding its payment link reads it.
/// </summary>
/// <param name="Outstanding">What is still owed. Zero once it is settled.</param>
/// <param name="CanPayOnline">
/// The company can take a card right now. False once the invoice is paid or cancelled, and
/// false if the company has since stopped accepting cards — in which case the page says so
/// instead of offering a button that cannot work.
/// </param>
public record PublicInvoiceDto(
    string CompanyName,
    string? CompanyBrandColor,
    string Number,
    string Currency,
    DateOnly IssueDate,
    DateOnly DueDate,
    decimal Total,
    decimal Paid,
    decimal Outstanding,
    bool IsPaid,
    bool IsCancelled,
    bool CanPayOnline,
    bool CanPayPayPal = false);

/// <summary>The order id PayPal appends to the URL it sends the customer back to.</summary>
public record ConfirmPayPalRequest(string OrderId);

/// <summary>The session id Stripe appends to the URL it sends the customer back to.</summary>
public record ConfirmInvoicePaymentRequest(string SessionId);

/// <summary>
/// Paying an invoice from the email it arrived in.
///
/// No account, by design. A client who has been emailed an invoice must not be made to register
/// with Vexta to settle it — that is a wall between a company and its own money. The token in
/// the link is the whole credential, and it is 32 random bytes for that reason.
///
/// What it is allowed to say is the invoice the holder of the link was already sent: its number,
/// its dates, what it comes to and what is left. Not the lines, not the project, not the other
/// invoices of the same client, and nothing at all about the company beyond its name and its
/// colour. The projection below is the whole of it, so a column added to <c>Invoice</c> later
/// cannot leak through here by accident.
///
/// Every query ignores the query filters and names what it wants: there is no signed-in tenant
/// for them to resolve against, and left alone they would compare against null and find nothing.
/// </summary>
[ApiController]
[Route("api/public/factures")]
[AllowAnonymous]
public class PublicInvoicePaymentController(
    VextaDbContext db,
    IStripeConnectService connect,
    IPayPalService paypal,
    IFeatureService features,
    IConfiguration configuration,
    ILogger<PublicInvoicePaymentController> logger) : ControllerBase
{
    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    [HttpGet("{token}")]
    public async Task<ActionResult<PublicInvoiceDto>> Get(string token, CancellationToken ct)
    {
        var found = await LoadAsync(token, ct);
        if (found is null) return NotFound();

        var (invoice, tenant) = found.Value;
        return Ok(await BuildAsync(invoice, tenant, ct));
    }

    /// <summary>
    /// Starts the card payment and hands back Stripe's hosted page.
    ///
    /// The amount is worked out here, from the invoice and what has already been paid against
    /// it. Nothing about the figure comes from the caller: a browser that could name its own
    /// amount could settle a four-thousand-dollar invoice for a dollar.
    /// </summary>
    [HttpPost("{token}/paiement")]
    public async Task<ActionResult<object>> StartPayment(string token, CancellationToken ct)
    {
        var found = await LoadAsync(token, ct);
        if (found is null) return NotFound();

        var (invoice, tenant) = found.Value;
        var state = await BuildAsync(invoice, tenant, ct);

        if (!state.CanPayOnline)
        {
            return BadRequest(new
            {
                message = state.IsCancelled
                    ? "Cette facture a été annulée."
                    : state.IsPaid
                        ? "Cette facture est déjà réglée."
                        : "Cette entreprise n'accepte pas les paiements en ligne pour le moment."
            });
        }

        try
        {
            var url = await connect.CreateInvoiceCheckoutSessionAsync(
                tenant,
                invoice,
                state.Outstanding,
                successUrl: $"{InvoicePayLink.Url(FrontendUrl, token)}?paiement=succes&session_id={{CHECKOUT_SESSION_ID}}",
                cancelUrl: $"{InvoicePayLink.Url(FrontendUrl, token)}?paiement=annule",
                ct);

            return Ok(new { url });
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Stripe a refusé le paiement de la facture {Invoice}.", invoice.Id);
            return BadRequest(new { message = "Le paiement n'a pas pu être démarré. Réessayez dans un instant." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Starts a PayPal payment on the company's own PayPal account and hands back PayPal's page.
    /// The amount is the invoice's outstanding figure, never one the caller names.
    /// </summary>
    [HttpPost("{token}/paypal")]
    public async Task<ActionResult<object>> StartPayPal(string token, CancellationToken ct)
    {
        var found = await LoadAsync(token, ct);
        if (found is null) return NotFound();

        var (invoice, tenant) = found.Value;
        var state = await BuildAsync(invoice, tenant, ct);
        if (!state.CanPayPayPal)
        {
            return BadRequest(new { message = state.IsPaid ? "Cette facture est déjà réglée." : "Le paiement PayPal n'est pas offert pour cette facture." });
        }

        try
        {
            var (_, url) = await paypal.CreateOrderAsync(
                tenant,
                invoice.Id,
                $"Facture {invoice.Number}",
                state.Outstanding,
                invoice.Currency,
                returnUrl: $"{InvoicePayLink.Url(FrontendUrl, token)}?paypal=succes",
                cancelUrl: $"{InvoicePayLink.Url(FrontendUrl, token)}?paiement=annule",
                ct);
            return Ok(new { url });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning(ex, "PayPal injoignable pour la facture {Invoice}.", invoice.Id);
            return BadRequest(new { message = "PayPal ne répond pas. Réessayez dans un instant." });
        }
    }

    /// <summary>
    /// Captures the PayPal order on the way back and records the payment, once. PayPal is asked
    /// whether the order completed and for which invoice; the browser's word is not taken.
    /// </summary>
    [HttpPost("{token}/paypal/confirmation")]
    public async Task<ActionResult<PublicInvoiceDto>> ConfirmPayPal(string token, ConfirmPayPalRequest request, CancellationToken ct)
    {
        var found = await LoadAsync(token, ct);
        if (found is null) return NotFound();
        var (invoice, tenant) = found.Value;

        if (!string.IsNullOrWhiteSpace(request.OrderId) && request.OrderId.Length <= 64)
        {
            try
            {
                var capture = await paypal.CaptureOrderAsync(tenant, request.OrderId.Trim(), ct);
                if (capture is not null && capture.InvoiceId == invoice.Id.ToString() && capture.Amount > 0)
                {
                    var reference = $"paypal:{capture.CaptureId}";
                    var already = await db.InvoicePayments.IgnoreQueryFilters()
                        .AnyAsync(p => p.InvoiceId == invoice.Id && p.Reference == reference, ct);
                    if (!already)
                    {
                        db.InvoicePayments.Add(new Domain.InvoicePayment
                        {
                            TenantId = invoice.TenantId,
                            InvoiceId = invoice.Id,
                            Date = DateOnly.FromDateTime(DateTime.Now),
                            Amount = InvoiceTotals.Round(capture.Amount),
                            Method = Domain.PaymentMethod.PayPal,
                            Reference = reference,
                            Note = "Payé en ligne avec PayPal",
                        });

                        var billing = await db.BillingSettings.IgnoreQueryFilters().AsNoTracking()
                            .FirstOrDefaultAsync(b => b.TenantId == invoice.TenantId, ct);
                        var total = InvoiceTotals.For(invoice.Lines, billing, invoice.IsTaxExempt).Total;
                        var takenBefore = await db.InvoicePayments.IgnoreQueryFilters()
                            .Where(p => p.InvoiceId == invoice.Id).SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
                        var paidBefore = InvoiceSettlement.Net(
                            takenBefore, await InvoiceSettlement.RefundedAsync(db.InvoiceRefunds.IgnoreQueryFilters(), invoice.Id, ct));
                        var credited = await InvoiceSettlement.CreditedAsync(db.InvoiceCredits.IgnoreQueryFilters(), invoice.Id, ct);
                        InvoiceStatusRules.ApplyPaid(invoice, paidBefore + capture.Amount, total, credited);

                        await db.SaveChangesAsync(ct);
                        logger.LogInformation("Paiement PayPal de {Amount} enregistré sur la facture {Invoice}.", capture.Amount, invoice.Id);
                    }
                }
            }
            catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
            {
                logger.LogWarning(ex, "Confirmation PayPal impossible pour la facture {Invoice}.", invoice.Id);
            }
        }

        return Ok(await BuildAsync(invoice, tenant, ct));
    }

    /// <summary>
    /// Records the payment on the way back from Stripe, so the page says "payé" without waiting
    /// for the webhook.
    ///
    /// The session id is not believed on its own — Stripe is asked whether that session is
    /// finished and paid, and whether it belongs to this company's account. A session id from
    /// somewhere else resolves to nothing.
    /// </summary>
    [HttpPost("{token}/confirmation")]
    public async Task<ActionResult<PublicInvoiceDto>> Confirm(
        string token, ConfirmInvoicePaymentRequest request, CancellationToken ct)
    {
        var found = await LoadAsync(token, ct);
        if (found is null) return NotFound();

        var (invoice, tenant) = found.Value;

        if (string.IsNullOrWhiteSpace(request.SessionId))
        {
            return BadRequest(new { message = "Session de paiement manquante." });
        }

        try
        {
            await connect.ConfirmInvoicePaymentAsync(request.SessionId.Trim(), tenant, db, ct);
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Confirmation refusée pour la facture {Invoice}.", invoice.Id);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Confirmation impossible pour la facture {Invoice}.", invoice.Id);
        }

        // The state either way, rather than a yes or a no. The page's job is to show where the
        // invoice stands, and the webhook may well have recorded it a second before this call.
        return Ok(await BuildAsync(invoice, tenant, ct));
    }

    /// <summary>
    /// The invoice behind a token, with the company that issued it. Null for anything that does
    /// not resolve, so an unknown token and a token whose invoice was deleted are the same 404.
    /// </summary>
    private async Task<(Invoice Invoice, Tenant Tenant)?> LoadAsync(string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 64) return null;

        var invoice = await db.Invoices.IgnoreQueryFilters()
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.PayToken == token && i.DeletedAt == null, ct);

        if (invoice is null) return null;

        // A draft has a token only if one was made and the invoice was then put back to draft.
        // Nothing to pay: the figures on it are still moving.
        if (invoice.Status == InvoiceStatus.Brouillon) return null;

        var tenant = await db.Tenants.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.Id == invoice.TenantId, ct);

        return tenant is null ? null : (invoice, tenant);
    }

    private async Task<PublicInvoiceDto> BuildAsync(Invoice invoice, Tenant tenant, CancellationToken ct)
    {
        var billing = await db.BillingSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == invoice.TenantId, ct);

        var total = InvoiceTotals.For(invoice.Lines, billing, invoice.IsTaxExempt).Total;

        var taken = await db.InvoicePayments.IgnoreQueryFilters()
            .Where(p => p.InvoiceId == invoice.Id)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;

        // Refunds come off before the outstanding figure is worked out. This is the screen where
        // getting it wrong costs the most: an invoice that was paid and then refunded would say
        // "déjà réglée" to the one person standing in front of it willing to pay it.
        var paid = InvoiceSettlement.Net(
            taken, await InvoiceSettlement.RefundedAsync(db.InvoiceRefunds.IgnoreQueryFilters(), invoice.Id, ct));

        // And what credit notes took off. The amount on the Pay button is what the checkout
        // charges, so an uncounted credit note here is a card charged for money not owed.
        var credited = await InvoiceSettlement.CreditedAsync(
            db.InvoiceCredits.IgnoreQueryFilters(), invoice.Id, ct);

        var outstanding = InvoiceSettlement.Outstanding(total, credited, paid);
        var cancelled = invoice.Status == InvoiceStatus.Annulee;

        // Checked here and not taken from the company's cached flag alone: a plan that dropped
        // the feature must stop the button, and the flag knows nothing about plans.
        var included = await features.IsEnabledAsync(FeatureKeys.Payments, invoice.TenantId, ct);

        return new PublicInvoiceDto(
            CompanyName: tenant.Name,
            CompanyBrandColor: tenant.BrandColor,
            Number: invoice.Number,
            Currency: invoice.Currency,
            IssueDate: invoice.IssueDate,
            DueDate: invoice.DueDate,
            Total: total,
            Paid: InvoiceTotals.Round(paid),
            Outstanding: outstanding,
            IsPaid: outstanding <= 0 && total > 0,
            IsCancelled: cancelled,
            CanPayOnline: !cancelled
                && outstanding > 0
                && included
                && tenant.StripeChargesEnabled
                && tenant.StripeAccountId is not null,
            CanPayPayPal: !cancelled
                && outstanding > 0
                && invoice.Status != InvoiceStatus.TransfereeComptabilite
                && tenant.PayPalSecretProtected is not null
                && await features.IsEnabledAsync(FeatureKeys.PayPal, invoice.TenantId, ct));
    }
}
