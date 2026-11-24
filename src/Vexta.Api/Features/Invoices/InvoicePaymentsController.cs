using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// The money taken against one invoice.
///
/// Several per invoice on purpose: a deposit then a balance is how a job normally gets paid, and
/// a single "paid" flag cannot say that half of it has arrived. What is still owed is the
/// invoice total minus these lines, worked out by <see cref="InvoiceTotals"/> — the same
/// arithmetic the printed document uses, so a client who has paid what the paper says is paid in
/// full here too.
///
/// A customer reads what they have paid on their own invoice. Taking a payment is the company's.
/// </summary>
[ApiController]
[Route("api/invoices/{invoiceId:guid}/paiements")]
// No [StaffOnly]: that filter refuses the Client role outright, which would have contradicted
// the role list below. A customer reading what they have paid on their own invoice is reading
// their own money, and the query filter already narrows it to their own rows.
[Authorize(Roles = Roles.StaffAndClients)]
[RequireActiveSubscription]
public class InvoicePaymentsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<InvoicePaymentsDto>> List(Guid invoiceId, CancellationToken ct)
    {
        var invoice = await LoadInvoiceAsync(invoiceId, ct);
        if (invoice is null) return NotFound();

        return Ok(await BuildAsync(invoice, ct));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<InvoicePaymentsDto>> Create(
        Guid invoiceId, SaveInvoicePaymentRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var invoice = await LoadInvoiceAsync(invoiceId, ct);
        if (invoice is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        // A draft has not been given to anybody, so there is nothing to have been paid yet. The
        // figures on it are still moving, and a payment against a moving total is a payment
        // that stops matching the document the moment a line is corrected.
        if (invoice.Status == InvoiceStatus.Brouillon)
        {
            return BadRequest(new
            {
                message = "Cette facture est encore un brouillon. Envoyez-la avant d'y inscrire un paiement."
            });
        }

        if (invoice.Status == InvoiceStatus.Annulee)
        {
            return BadRequest(new { message = "Cette facture est annulée." });
        }

        var state = await BuildAsync(invoice, ct);

        // Measured against what is still owed, not against the total: without this, two people
        // at two counters each take the full amount and the invoice is paid twice.
        if (request.Amount > state.Outstanding)
        {
            return BadRequest(new
            {
                message = state.Outstanding <= 0
                    ? "Cette facture est déjà réglée."
                    : $"Il ne reste que {state.Outstanding:N2} $ à payer sur cette facture."
            });
        }

        if (request.Method == PaymentMethod.PorteAuCompte
            && invoice.Client?.AccountRefusal() is { } refusal)
        {
            return BadRequest(new { message = refusal });
        }

        var payment = new InvoicePayment
        {
            TenantId = tenantId,
            InvoiceId = invoiceId,
            Date = request.Date ?? DateOnly.FromDateTime(DateTime.Now),
            Amount = request.Amount,
            Method = request.Method,
            Reference = Clean(request.Reference),
            Note = Clean(request.Note),
            CreatedByUserId = currentUser.UserId
        };

        db.InvoicePayments.Add(payment);

        // Charged to the account rather than paid: the invoice is settled on paper and the
        // client owes the money on their account instead. The two rows are written in the same
        // SaveChanges, so there is no moment where the invoice is paid and the account does not
        // know about it.
        if (request.Method == PaymentMethod.PorteAuCompte)
        {
            db.ClientAccountEntries.Add(new ClientAccountEntry
            {
                TenantId = tenantId,
                ClientId = invoice.ClientId,
                Date = payment.Date,
                Kind = AccountEntryKind.Charge,
                Amount = payment.Amount,
                Description = $"Facture {invoice.Number}",
                InvoiceId = invoiceId,
                InvoicePaymentId = payment.Id,
                CreatedByUserId = currentUser.UserId
            });
        }

        ApplyStatus(invoice, state.Paid + payment.Amount, state.Total);
        await db.SaveChangesAsync(ct);

        return Ok(await BuildAsync(invoice, ct));
    }

    /// <summary>
    /// Undoing a payment that was entered by mistake. The account line it created goes with it —
    /// leaving it would have the client owing money on an invoice that is no longer paid.
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<InvoicePaymentsDto>> Delete(
        Guid invoiceId, Guid id, CancellationToken ct)
    {
        var invoice = await LoadInvoiceAsync(invoiceId, ct);
        if (invoice is null) return NotFound();

        var payment = await db.InvoicePayments
            .FirstOrDefaultAsync(p => p.Id == id && p.InvoiceId == invoiceId, ct);
        if (payment is null) return NotFound();

        // Read before anything is staged for removal. BuildAsync queries the database, so
        // reading it afterwards would depend on the deletes not having been flushed yet — true
        // today, and the kind of thing that stops being true quietly.
        var state = await BuildAsync(invoice, ct);

        var charges = await db.ClientAccountEntries
            .Where(e => e.InvoicePaymentId == id)
            .ToListAsync(ct);

        db.ClientAccountEntries.RemoveRange(charges);
        db.InvoicePayments.Remove(payment);

        ApplyStatus(invoice, state.Paid - payment.Amount, state.Total);

        await db.SaveChangesAsync(ct);

        return Ok(await BuildAsync(invoice, ct));
    }

    /// <summary>
    /// Where the invoice stands once this much has been paid.
    ///
    /// Only ever moves between Envoyée, En retard and Payée. A cancelled invoice stays
    /// cancelled, and a draft never gets here — and "paid" is decided by the arithmetic rather
    /// than by somebody remembering to change a dropdown.
    ///
    /// The rule itself lives in <see cref="InvoiceStatusRules"/>, shared with the online payment
    /// that arrives without anybody pressing anything.
    /// </summary>
    private static void ApplyStatus(Invoice invoice, decimal paid, decimal total) =>
        InvoiceStatusRules.ApplyPaid(invoice, paid, total);

    private Task<Invoice?> LoadInvoiceAsync(Guid invoiceId, CancellationToken ct) => db.Invoices
        .Include(i => i.Client)
        .Include(i => i.Lines)
        .FirstOrDefaultAsync(i => i.Id == invoiceId, ct);

    private async Task<InvoicePaymentsDto> BuildAsync(Invoice invoice, CancellationToken ct)
    {
        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == invoice.TenantId, ct);

        var total = InvoiceTotals.For(invoice.Lines, settings, invoice.IsTaxExempt).Total;

        var payments = await db.InvoicePayments.AsNoTracking()
            .Where(p => p.InvoiceId == invoice.Id)
            .OrderByDescending(p => p.Date).ThenByDescending(p => p.CreatedAt)
            .Select(p => new InvoicePaymentDto(
                p.Id, p.Date, p.Amount, p.Method, p.Reference, p.Note, p.CreatedAt))
            .ToListAsync(ct);

        var paid = payments.Sum(p => p.Amount);

        return new InvoicePaymentsDto(
            total,
            paid,
            // Never negative: a rounding cent on an over-collected invoice should read as
            // settled, not as a debt owed back through this screen.
            Math.Max(0m, InvoiceTotals.Round(total - paid)),
            invoice.Client?.AccountRefusal(),
            payments);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? Problem(SaveInvoicePaymentRequest r)
    {
        if (r.Amount <= 0) return "Le montant doit être supérieur à zéro.";
        if (r.Amount > 10_000_000m) return "Le montant est trop élevé.";
        if (r.Reference?.Trim().Length > 80) return "La référence est trop longue.";
        if (r.Note?.Trim().Length > 300) return "La note est trop longue.";

        if (r.Date is { } date && date > DateOnly.FromDateTime(DateTime.Now).AddDays(1))
        {
            return "La date ne peut pas être dans le futur.";
        }

        return null;
    }
}
