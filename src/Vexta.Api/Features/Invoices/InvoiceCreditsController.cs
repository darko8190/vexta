using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.BillingSettings;

namespace Vexta.Api.Features.Invoices;

public record InvoiceCreditDto(
    Guid Id,
    string Number,
    DateOnly Date,
    decimal Subtotal,
    decimal Gst,
    decimal Qst,
    decimal Amount,
    string Reason,
    DateTimeOffset CreatedAt);

/// <summary>What was credited on one invoice, and how much more could be.</summary>
public record InvoiceCreditsDto(
    decimal Total,
    decimal Credited,
    /// <summary>The most a further credit note can take off: what the invoice still bills.</summary>
    decimal Creditable,
    IReadOnlyList<InvoiceCreditDto> Credits);

/// <param name="Amount">Taxes included: what the client stops owing. The split is ours to work out.</param>
public record SaveInvoiceCreditRequest(decimal Amount, string Reason, DateOnly? Date = null);

/// <summary>
/// The credit notes on one invoice.
///
/// The amount is asked for taxes included, because that is the figure agreed with the client
/// ("on vous enlève 80 $"), and split here in the proportions the invoice itself used. Asking
/// somebody at the counter to work out the GST and QST on a credit is asking for two numbers
/// that will not add up.
///
/// A customer reads the credit notes on their own invoice; only the company issues one.
/// </summary>
[ApiController]
[Route("api/invoices/{invoiceId:guid}/credits")]
[Authorize(Roles = Roles.StaffAndClients)]
[RequireActiveSubscription]
public class InvoiceCreditsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<InvoiceCreditsDto>> List(Guid invoiceId, CancellationToken ct)
    {
        var invoice = await db.Invoices.AsNoTracking()
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, ct);

        return invoice is null ? NotFound() : Ok(await BuildAsync(invoice, ct));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<InvoiceCreditsDto>> Create(
        Guid invoiceId, SaveInvoiceCreditRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var invoice = await db.Invoices.Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, ct);
        if (invoice is null) return NotFound();

        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        // A draft is corrected, not credited: nobody holds it yet, so the line is simply changed.
        // A credit note against it would be a second document explaining a first one that was
        // never sent.
        if (invoice.Status == InvoiceStatus.Brouillon)
        {
            return BadRequest(new
            {
                message = "Cette facture est encore un brouillon. Corrigez-la directement plutôt que de la créditer."
            });
        }

        if (invoice.Status == InvoiceStatus.Annulee)
        {
            return BadRequest(new { message = "Cette facture est annulée : il n'y a plus rien à créditer." });
        }

        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
        if (settings is null)
        {
            return BadRequest(new { message = "Configurez d'abord la facturation de l'entreprise." });
        }

        var totals = InvoiceTotals.For(invoice.Lines, settings, invoice.IsTaxExempt);

        var earlier = await db.InvoiceCredits.AsNoTracking()
            .Where(c => c.InvoiceId == invoiceId)
            .Select(c => new { c.Amount, c.Gst, c.Qst })
            .ToListAsync(ct);

        var credited = earlier.Sum(c => c.Amount);
        var creditable = Math.Max(0m, InvoiceTotals.Round(totals.Total - credited));

        // Against what the invoice still bills. A credit note larger than the invoice would say
        // the company owes money it never billed for, which is a refund or a gift, not this.
        if (request.Amount > creditable)
        {
            return BadRequest(new
            {
                message = creditable <= 0
                    ? "Cette facture est déjà entièrement créditée."
                    : $"Vous ne pouvez pas créditer plus que les {creditable:N2} $ qu'il reste sur cette facture."
            });
        }

        var (subtotal, gst, qst) = Split(request.Amount, creditable, totals,
            earlier.Sum(c => c.Gst), earlier.Sum(c => c.Qst));

        var credit = new InvoiceCredit
        {
            TenantId = tenantId,
            InvoiceId = invoiceId,
            Number = InvoiceNumbering.Format(settings.CreditPrefix, settings.NextCreditNumber),
            Date = request.Date ?? DateOnly.FromDateTime(DateTime.Now),
            Subtotal = subtotal,
            Gst = gst,
            Qst = qst,
            Amount = request.Amount,
            Reason = request.Reason.Trim(),
            CreatedByUserId = currentUser.UserId
        };

        // Advanced in the same SaveChanges as the note it numbers, so a failed save does not
        // burn a number and a successful one cannot leave the counter behind.
        settings.NextCreditNumber++;
        db.InvoiceCredits.Add(credit);

        InvoiceStatusRules.ApplyPaid(invoice, await NetPaidAsync(invoiceId, ct), totals.Total, credited + credit.Amount);

        await db.SaveChangesAsync(ct);

        return Ok(await BuildAsync(invoice, ct));
    }

    /// <summary>
    /// Removing a credit note issued by mistake.
    ///
    /// Its number is not handed out again: somebody may already have it in their filing, and two
    /// different documents under one number is worse than a gap the reason explains.
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<InvoiceCreditsDto>> Delete(Guid invoiceId, Guid id, CancellationToken ct)
    {
        var invoice = await db.Invoices.Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, ct);
        if (invoice is null) return NotFound();

        var credit = await db.InvoiceCredits
            .FirstOrDefaultAsync(c => c.Id == id && c.InvoiceId == invoiceId, ct);
        if (credit is null) return NotFound();

        var state = await BuildAsync(invoice, ct);

        db.InvoiceCredits.Remove(credit);

        InvoiceStatusRules.ApplyPaid(
            invoice, await NetPaidAsync(invoiceId, ct), state.Total, state.Credited - credit.Amount);

        await db.SaveChangesAsync(ct);

        return Ok(await BuildAsync(invoice, ct));
    }

    // ---- Helpers ----

    /// <summary>
    /// The credit's taxes, in the proportions the invoice used.
    ///
    /// The last credit that takes the invoice to zero takes exactly what is left of each tax
    /// rather than a fresh proportion of it: rounding each credit on its own would otherwise
    /// leave a cent of GST credited twice or not at all, on an invoice that says it is fully
    /// credited.
    /// </summary>
    private static (decimal Subtotal, decimal Gst, decimal Qst) Split(
        decimal amount, decimal creditable, InvoiceTotalsResult totals, decimal gstBefore, decimal qstBefore)
    {
        decimal gst, qst;

        if (amount == creditable)
        {
            gst = Math.Max(0m, totals.Gst - gstBefore);
            qst = Math.Max(0m, totals.Qst - qstBefore);
        }
        else if (totals.Total > 0)
        {
            gst = InvoiceTotals.Round(amount * totals.Gst / totals.Total);
            qst = InvoiceTotals.Round(amount * totals.Qst / totals.Total);
        }
        else
        {
            gst = 0m;
            qst = 0m;
        }

        // The subtotal is what is left, so the three always add up to the amount exactly.
        return (amount - gst - qst, gst, qst);
    }

    private async Task<decimal> NetPaidAsync(Guid invoiceId, CancellationToken ct)
    {
        var taken = await db.InvoicePayments
            .Where(p => p.InvoiceId == invoiceId)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;

        return InvoiceSettlement.Net(taken, await InvoiceSettlement.RefundedAsync(db.InvoiceRefunds, invoiceId, ct));
    }

    private async Task<InvoiceCreditsDto> BuildAsync(Invoice invoice, CancellationToken ct)
    {
        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == invoice.TenantId, ct);

        var total = InvoiceTotals.For(invoice.Lines, settings, invoice.IsTaxExempt).Total;

        var credits = await db.InvoiceCredits.AsNoTracking()
            .Where(c => c.InvoiceId == invoice.Id)
            .OrderByDescending(c => c.Date).ThenByDescending(c => c.CreatedAt)
            .Select(c => new InvoiceCreditDto(
                c.Id, c.Number, c.Date, c.Subtotal, c.Gst, c.Qst, c.Amount, c.Reason, c.CreatedAt))
            .ToListAsync(ct);

        var credited = credits.Sum(c => c.Amount);

        return new InvoiceCreditsDto(
            total,
            InvoiceTotals.Round(credited),
            Math.Max(0m, InvoiceTotals.Round(total - credited)),
            credits);
    }

    private static string? Problem(SaveInvoiceCreditRequest request)
    {
        if (request.Amount <= 0) return "Le montant doit être supérieur à zéro.";
        if (request.Amount > 10_000_000m) return "Ce montant est trop grand.";
        if (decimal.Round(request.Amount, 2) != request.Amount) return "Le montant ne peut pas avoir plus de deux décimales.";
        if (string.IsNullOrWhiteSpace(request.Reason)) return "Indiquez la raison du crédit : c'est ce que le client lira.";
        if (request.Reason.Trim().Length > 300) return "La raison est trop longue.";
        if (request.Date is { } date && date > DateOnly.FromDateTime(DateTime.Now).AddDays(1))
        {
            return "Une note de crédit ne peut pas être datée dans le futur.";
        }
        return null;
    }
}
