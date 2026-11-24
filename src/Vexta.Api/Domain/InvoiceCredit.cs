namespace Vexta.Api.Domain;

/// <summary>
/// A credit note: the company saying an invoice bills less than it says.
///
/// A different thing from a refund, and the other half of the same rail. A refund says money
/// went back; a credit note says the money was never owed. A client billed for a door that was
/// never installed is owed a credit note whether or not they paid; a client who paid twice is
/// owed a refund and nothing about the invoice changes. Squaring a refunded invoice usually takes
/// both, and the screen shows the gap until it has.
///
/// Its own number, from its own counter. It is a document the client keeps and quotes, and an
/// accountant files it beside the invoice it reduces. Never a line on that invoice, either: the
/// invoice was sent as it was, and rewriting a document somebody already holds is how two
/// copies of "the same" invoice end up disagreeing.
///
/// The taxes are kept with it, split the way the invoice split them. Taxes collected go down
/// with the credit, and a credit note that only carried a total would leave whoever files the
/// returns to reconstruct the split from the invoice, months later, by hand.
/// </summary>
public class InvoiceCredit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    /// <summary>NC-0001. Same shape as an invoice number, from its own counter.</summary>
    public required string Number { get; set; }

    public DateOnly Date { get; set; }

    /// <summary>Before taxes. Subtotal + Gst + Qst is always exactly <see cref="Amount"/>.</summary>
    public decimal Subtotal { get; set; }
    public decimal Gst { get; set; }
    public decimal Qst { get; set; }

    /// <summary>What the client no longer owes, taxes included. Always positive.</summary>
    public decimal Amount { get; set; }

    /// <summary>Why. Required: it is the line the client reads, and the first thing anybody asks.</summary>
    public required string Reason { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; set; }
}
