namespace Vexta.Api.Domain;

/// <summary>
/// Money given back to a client on an invoice.
///
/// Its own table and its own date, never a negative <see cref="InvoicePayment"/>. A day's
/// takings have to add up, and they cannot if the column that holds what came in also holds
/// what went out. It is also a different question: "qu'est-ce qui est rentré mardi" and
/// "qu'est-ce qu'on a remboursé en mars" are asked by the same person at different moments, and
/// one list that answers both answers neither.
///
/// What it does not do is change what was billed. The invoice still says what it says; the
/// refund says money moved the other way. An invoice that should itself be smaller needs a
/// credit note, which is a different document and the other half of this rail -- and the gap
/// between them shows up as an amount still outstanding, which is the correct thing to see
/// when a refund was given without the paperwork being squared.
/// </summary>
public class InvoiceRefund
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    /// <summary>
    /// The payment being given back, when it is one in particular.
    ///
    /// Required for a card: Stripe refunds a payment, not an invoice, so without it there is
    /// nothing to send the money back along. Optional for the rest -- a hundred dollars handed
    /// back across a counter is not obviously any one of three cheques.
    /// </summary>
    public Guid? InvoicePaymentId { get; set; }
    public InvoicePayment? InvoicePayment { get; set; }

    public DateOnly Date { get; set; }

    /// <summary>Always positive, like a payment. The direction is the table it is in.</summary>
    public decimal Amount { get; set; }

    /// <summary>How the money went back: cash out of the till, a cheque, a card reversal.</summary>
    public PaymentMethod Method { get; set; }

    /// <summary>A cheque number, a transfer reference.</summary>
    public string? Reference { get; set; }

    /// <summary>Why. Worth more here than on a payment: somebody will ask.</summary>
    public string? Note { get; set; }

    /// <summary>
    /// Stripe's own refund, when the money really went back through the card.
    ///
    /// Its presence is what makes this row permanent. A refund somebody typed because they
    /// handed over cash can be deleted when it was a mistake; one Stripe has already sent
    /// cannot, because deleting it here would not bring the money back.
    /// </summary>
    public string? StripeRefundId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; set; }
}
