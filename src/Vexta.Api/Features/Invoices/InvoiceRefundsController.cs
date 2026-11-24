using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

// Stripe has an Invoice and a PaymentMethod of its own, neither of which this file ever
// means. Spelled out so a later edit cannot resolve the ambiguity the wrong way.
using Invoice = Vexta.Api.Domain.Invoice;
using PaymentMethod = Vexta.Api.Domain.PaymentMethod;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// The money given back on one invoice.
///
/// Beside the payments rather than inside them. A refund is not a negative payment: it has its
/// own date, its own reason and often its own method — a card payment given back as a cheque is
/// an ordinary week — and a column that held both would make a day's takings impossible to add
/// up, which is the one number the books exist to produce.
///
/// What a refund does not do is change what was billed. The invoice still says what it says, so
/// giving money back without a credit note leaves an amount outstanding. That is correct and it
/// is meant to be visible: the paperwork is not square, and the screen says so rather than
/// quietly making the figures agree.
///
/// A customer reads what was given back on their own invoice; only the company gives it.
/// </summary>
[ApiController]
[Route("api/invoices/{invoiceId:guid}/remboursements")]
[Authorize(Roles = Roles.StaffAndClients)]
[RequireActiveSubscription]
public class InvoiceRefundsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IStripeConnectService connect,
    ILogger<InvoiceRefundsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<InvoiceRefundsDto>> List(Guid invoiceId, CancellationToken ct)
    {
        var invoice = await db.Invoices.AsNoTracking()
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, ct);

        return invoice is null ? NotFound() : Ok(await BuildAsync(invoice, ct));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<InvoiceRefundsDto>> Create(
        Guid invoiceId, SaveInvoiceRefundRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var invoice = await db.Invoices.Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, ct);
        if (invoice is null) return NotFound();

        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var state = await BuildAsync(invoice, ct);

        // Measured against what stayed with the company, not against the invoice total. A
        // company cannot give back money it never took, and this is the check that stops a
        // mistyped amount from becoming a wire transfer.
        if (request.Amount > state.Refundable)
        {
            return BadRequest(new
            {
                message = state.Refundable <= 0
                    ? "Il n'y a rien à rembourser sur cette facture."
                    : $"Vous ne pouvez pas rendre plus que les {state.Refundable:N2} $ encaissés sur cette facture."
            });
        }

        RefundablePaymentDto? source = null;

        if (request.InvoicePaymentId is { } paymentId)
        {
            source = state.Payments.FirstOrDefault(p => p.Id == paymentId);
            if (source is null) return BadRequest(new { message = "Ce paiement n'existe pas sur cette facture." });

            // Per payment as well as per invoice: without it, three payments of a hundred could
            // all be reversed against the same one, and the card would refuse the second.
            if (request.Amount > source.Remaining)
            {
                return BadRequest(new
                {
                    message = $"Il ne reste que {source.Remaining:N2} $ à rendre sur ce paiement."
                });
            }
        }

        if (request.Online)
        {
            if (source is null)
            {
                return BadRequest(new { message = "Choisissez le paiement par carte à renvoyer." });
            }

            if (!source.Online)
            {
                return BadRequest(new
                {
                    message = "Ce paiement n'est pas arrivé par carte. Rendez-le autrement et inscrivez-le ici."
                });
            }
        }

        var refund = new InvoiceRefund
        {
            TenantId = tenantId,
            InvoiceId = invoiceId,
            InvoicePaymentId = request.InvoicePaymentId,
            Date = request.Date ?? DateOnly.FromDateTime(DateTime.Now),
            Amount = request.Amount,
            Method = request.Online ? PaymentMethod.Carte : request.Method,
            Reference = Clean(request.Reference),
            Note = Clean(request.Note),
            CreatedByUserId = currentUser.UserId
        };

        if (request.Online)
        {
            var tenant = await db.Tenants.IgnoreQueryFilters()
                .FirstOrDefaultAsync(t => t.Id == tenantId, ct);
            if (tenant is null) return Forbid();

            try
            {
                // Stripe first, then the row. The other order would write a refund for money
                // that never moved, and a book that claims to have paid somebody is worse than
                // one that is a minute behind the bank.
                refund.StripeRefundId = await connect.RefundAsync(tenant, source!.Reference!, request.Amount, ct);
            }
            catch (StripeException ex)
            {
                logger.LogWarning(ex, "Stripe a refusé le remboursement sur la facture {Invoice}.", invoiceId);
                return BadRequest(new
                {
                    message = "Stripe a refusé ce remboursement : " + (ex.StripeError?.Message ?? ex.Message)
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        db.InvoiceRefunds.Add(refund);

        // The invoice stops being settled by what went back out. It does not become a draft
        // again and it does not change what it bills — it simply has less against it.
        InvoiceStatusRules.ApplyPaid(
            invoice, state.Refundable - refund.Amount, await TotalOf(invoice, ct), await CreditedOf(invoice, ct));

        await db.SaveChangesAsync(ct);

        return Ok(await BuildAsync(invoice, ct));
    }

    /// <summary>
    /// Undoing a refund that was written down by mistake.
    ///
    /// Only one nobody sent through Stripe. A card refund has already left the company's
    /// account, and removing the line here would not bring it back — it would only make the
    /// books disagree with the bank, which is the failure this whole screen exists to prevent.
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<InvoiceRefundsDto>> Delete(
        Guid invoiceId, Guid id, CancellationToken ct)
    {
        var invoice = await db.Invoices.Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, ct);
        if (invoice is null) return NotFound();

        var refund = await db.InvoiceRefunds
            .FirstOrDefaultAsync(r => r.Id == id && r.InvoiceId == invoiceId, ct);
        if (refund is null) return NotFound();

        if (refund.StripeRefundId is not null)
        {
            return BadRequest(new
            {
                message = "Ce remboursement est parti par Stripe. L'argent est rendu : il ne peut pas être effacé d'ici."
            });
        }

        // Read before anything is staged for removal, like the payments screen does: BuildAsync
        // queries the database, and reading it afterwards would depend on the delete not having
        // been flushed yet.
        var state = await BuildAsync(invoice, ct);

        db.InvoiceRefunds.Remove(refund);

        InvoiceStatusRules.ApplyPaid(
            invoice, state.Refundable + refund.Amount, await TotalOf(invoice, ct), await CreditedOf(invoice, ct));

        await db.SaveChangesAsync(ct);

        return Ok(await BuildAsync(invoice, ct));
    }

    // ---- Helpers ----

    private Task<decimal> CreditedOf(Invoice invoice, CancellationToken ct) =>
        InvoiceSettlement.CreditedAsync(db.InvoiceCredits, invoice.Id, ct);

    private async Task<decimal> TotalOf(Invoice invoice, CancellationToken ct)
    {
        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == invoice.TenantId, ct);

        return InvoiceTotals.For(invoice.Lines, settings, invoice.IsTaxExempt).Total;
    }

    private async Task<InvoiceRefundsDto> BuildAsync(Invoice invoice, CancellationToken ct)
    {
        var refunds = await db.InvoiceRefunds.AsNoTracking()
            .Where(r => r.InvoiceId == invoice.Id)
            .OrderByDescending(r => r.Date).ThenByDescending(r => r.CreatedAt)
            .Select(r => new InvoiceRefundDto(
                r.Id, r.InvoicePaymentId, r.Date, r.Amount, r.Method,
                r.Reference, r.Note, r.StripeRefundId, r.CreatedAt))
            .ToListAsync(ct);

        var payments = await db.InvoicePayments.AsNoTracking()
            .Where(p => p.InvoiceId == invoice.Id)
            .OrderByDescending(p => p.Date).ThenByDescending(p => p.CreatedAt)
            .Select(p => new { p.Id, p.Date, p.Amount, p.Method, p.Reference })
            .ToListAsync(ct);

        var taken = payments.Sum(p => p.Amount);
        var given = refunds.Sum(r => r.Amount);

        var offered = payments
            // Nothing to give back on an invoice carried on the client's account: no money
            // arrived. Squaring that is an adjustment on the account, not a refund.
            .Where(p => p.Method != PaymentMethod.PorteAuCompte)
            .Select(p =>
            {
                var already = refunds.Where(r => r.InvoicePaymentId == p.Id).Sum(r => r.Amount);

                return new RefundablePaymentDto(
                    p.Id,
                    p.Date,
                    p.Amount,
                    InvoiceTotals.Round(Math.Max(0m, p.Amount - already)),
                    p.Method,
                    p.Reference,
                    // A payment intent is what Stripe can reverse. Anything else with the card
                    // method was typed in from a terminal slip, and Stripe has never heard of it.
                    IsPaymentIntent(p.Reference));
            })
            .Where(p => p.Remaining > 0)
            .ToList();

        return new InvoiceRefundsDto(
            InvoiceSettlement.Net(taken, given),
            InvoiceTotals.Round(given),
            offered,
            refunds);
    }

    /// <summary>
    /// Whether this reference is something Stripe can send money back along.
    ///
    /// The prefix is Stripe's own and stable. Deciding from it rather than from the payment's
    /// method, because "Carte" is also what somebody picks after running a card through the
    /// terminal on the counter — which Vexta has no part in and cannot reverse.
    /// </summary>
    private static bool IsPaymentIntent(string? reference) =>
        reference is not null && reference.StartsWith("pi_", StringComparison.Ordinal);

    private static string? Problem(SaveInvoiceRefundRequest request)
    {
        if (request.Amount <= 0) return "Le montant doit être supérieur à zéro.";
        if (request.Amount > 10_000_000m) return "Ce montant est trop grand.";
        if (!Enum.IsDefined(request.Method)) return "Mode de remboursement inconnu.";
        if (request.Method == PaymentMethod.PorteAuCompte)
        {
            return "« Porté au compte » n'est pas un remboursement : aucun argent n'a bougé. "
                + "Passez par un ajustement sur le compte du client.";
        }
        if (request.Reference is { Length: > 80 }) return "La référence est trop longue.";
        if (request.Note is { Length: > 300 }) return "La note est trop longue.";
        if (request.Date is { } date && date > DateOnly.FromDateTime(DateTime.Now).AddDays(1))
        {
            return "Un remboursement ne peut pas être daté dans le futur.";
        }
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
