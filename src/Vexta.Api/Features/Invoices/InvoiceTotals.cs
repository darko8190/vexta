using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// What an invoice adds up to: the subtotal, the two taxes separately, and the total.
///
/// Numbers only, no labels. What a tax line is *called* differs on purpose — the printed
/// invoice carries the registration number it was charged under, the screen does not — and
/// pushing the wording in here would mean one of the two surfaces gets the other's.
/// </summary>
public record InvoiceTotalsResult(decimal Subtotal, decimal Gst, decimal Qst)
{
    public decimal TaxTotal => Gst + Qst;
    public decimal Total => Subtotal + TaxTotal;
}

/// <summary>
/// The one place an invoice's total is worked out.
///
/// There were two, and they did not agree: the screen summed the raw line amounts and rounded
/// once, the PDF rounded each line and summed those, so the same invoice could read a cent
/// apart on paper and on screen. A third copy was about to appear here for payments, which have
/// to know whether an invoice is settled.
///
/// Rounding each line first is what survived, because that is the column the client is holding
/// and a total that does not match the figures printed above it is a total nobody believes.
///
/// Pure arithmetic — no database, no services — so the figure on the paper, the figure a payment
/// is measured against and the figure in a report are the same arithmetic by construction.
/// </summary>
public static class InvoiceTotals
{
    /// <summary>
    /// A line as the arithmetic sees it. A struct rather than the entity, so a draft being
    /// previewed and a stored invoice go through exactly the same calculation.
    /// </summary>
    public readonly record struct Line(decimal Quantity, decimal UnitPrice, bool IsTaxable);

    public static InvoiceTotalsResult For(
        IEnumerable<Line> lines, decimal gstRate, decimal qstRate, bool isTaxExempt)
    {
        var rows = lines.ToList();

        var subtotal = Round(rows.Sum(l => Round(l.Quantity * l.UnitPrice)));

        // Only what is taxable carries tax, and an exempt invoice has nothing taxable on it.
        var taxableBase = isTaxExempt
            ? 0m
            : rows.Where(l => l.IsTaxable).Sum(l => Round(l.Quantity * l.UnitPrice));

        return new InvoiceTotalsResult(
            subtotal,
            Round(taxableBase * gstRate / 100m),
            Round(taxableBase * qstRate / 100m));
    }

    /// <summary>The same, straight from the stored lines.</summary>
    public static InvoiceTotalsResult For(
        IEnumerable<InvoiceLine> lines, decimal gstRate, decimal qstRate, bool isTaxExempt) =>
        For(lines.Select(l => new Line(l.Quantity, l.UnitPrice, l.IsTaxable)), gstRate, qstRate, isTaxExempt);

    /// <summary>The same again, from the company's settings rather than two loose rates.</summary>
    public static InvoiceTotalsResult For(
        IEnumerable<InvoiceLine> lines, Domain.BillingSettings? settings, bool isTaxExempt) =>
        For(lines, settings?.GstRate ?? 0m, settings?.QstRate ?? 0m, isTaxExempt);

    /// <summary>
    /// Away from zero, which is how money is rounded on an invoice. Banker's rounding — .NET's
    /// default — would send half the half-cents the other way and leave a column that does not
    /// add up to its own total.
    /// </summary>
    public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
