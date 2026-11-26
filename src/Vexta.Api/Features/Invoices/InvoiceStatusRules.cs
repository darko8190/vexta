using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// What a payment does to an invoice's status.
///
/// Extracted because there are now two ways money arrives against an invoice — somebody enters
/// it at the counter, and a client pays the link in their email — and they have to reach the
/// same conclusion. A card paid online that left the invoice reading "Envoyée" would be chased
/// for money it already has.
///
/// No database and no services, like <see cref="InvoiceTotals"/>: the figure is worked out by
/// the caller, which is the only one that knows which rows count.
/// </summary>
public static class InvoiceStatusRules
{
    /// <summary>
    /// Moves an invoice to Payée once what has been paid covers the total, and back to Envoyée
    /// or En retard when it no longer does.
    ///
    /// A draft and a cancelled invoice are left exactly as they are. A draft has not been given
    /// to anybody, so nothing can have been paid against it; a cancelled one is a decision, and
    /// money arriving afterwards does not undo the decision — it is a refund waiting to happen,
    /// and silently reviving the invoice would hide that from the person who has to deal with it.
    /// </summary>
    /// <param name="credited">
    /// What credit notes took off the invoice. Required rather than defaulted: every caller has
    /// to have asked, or an invoice squared by a credit note would stay Envoyée forever on
    /// whichever screen forgot.
    /// </param>
    public static void ApplyPaid(Invoice invoice, decimal paid, decimal total, decimal credited)
    {
        if (invoice.Status is InvoiceStatus.Annulee or InvoiceStatus.Brouillon
            or InvoiceStatus.TransfereeComptabilite) return;

        invoice.Status = paid + credited >= total && total > 0
            ? InvoiceStatus.Payee
            : paid + credited > 0
                ? InvoiceStatus.PartiellementPayee
            // Back to what it was before it was paid: sent, or late if its due date has passed.
            // An invoice whose payment is undone must not stay green.
            : invoice.DueDate < DateOnly.FromDateTime(DateTime.Now)
                ? InvoiceStatus.EnRetard
                : InvoiceStatus.Envoyee;

        invoice.UpdatedAt = DateTimeOffset.UtcNow;
    }
}
