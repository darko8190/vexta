using Microsoft.EntityFrameworkCore;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// What an invoice has actually settled: taken in, less given back.
///
/// Written once because six screens ask it -- the invoice itself, the company's dashboard, the
/// customer's own list, the page a customer pays on, the online payment that arrives without
/// anybody pressing anything, and the status rule that decides what "Payée" means. Five of them
/// existed before refunds did and every one of them summed the payments alone. A refund that
/// one screen knows about and another does not is an invoice that reads as settled on the page
/// where somebody is about to be asked to pay it again.
///
/// The queryable is handed in rather than the context, so each caller keeps its own decision
/// about query filters: the public pay page and the customer's space read across tenants on
/// purpose, and the rest must not.
/// </summary>
public static class InvoiceSettlement
{
    /// <summary>
    /// What stayed with the company. Never negative: a company that gave back more than it took
    /// owes money, which is a conversation and not an invoice reading as minus forty dollars.
    /// </summary>
    public static decimal Net(decimal paid, decimal refunded) => Math.Max(0m, paid - refunded);

    /// <summary>What was given back on one invoice.</summary>
    public static async Task<decimal> RefundedAsync(
        IQueryable<InvoiceRefund> refunds, Guid invoiceId, CancellationToken ct) =>
        await refunds.Where(r => r.InvoiceId == invoiceId).SumAsync(r => (decimal?)r.Amount, ct) ?? 0m;

    /// <summary>
    /// What was given back on each of these invoices, in one pass. A subquery per invoice would
    /// be one round trip per row of a company's whole billing history.
    /// </summary>
    public static async Task<Dictionary<Guid, decimal>> RefundedByInvoiceAsync(
        IQueryable<InvoiceRefund> refunds, IReadOnlyCollection<Guid> invoiceIds, CancellationToken ct)
    {
        if (invoiceIds.Count == 0) return [];

        return await refunds
            .Where(r => invoiceIds.Contains(r.InvoiceId))
            .GroupBy(r => r.InvoiceId)
            .Select(g => new { g.Key, Amount = g.Sum(r => r.Amount) })
            .ToDictionaryAsync(x => x.Key, x => x.Amount, ct);
    }
}
