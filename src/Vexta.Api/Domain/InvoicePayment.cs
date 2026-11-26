namespace Vexta.Api.Domain;

/// <summary>
/// How a payment arrived. PorteAuCompte is the one that is not really a payment: the invoice is
/// settled and the client now owes the money on their account instead, which is why taking a
/// payment also writes a line there.
/// </summary>
public enum PaymentMethod
{
    Comptant = 0,
    Interac = 1,
    Carte = 2,
    Cheque = 3,
    Virement = 4,

    /// <summary>
    /// Put on the client's account. The shop is paid on paper, the client pays later, and the
    /// account is what remembers.
    /// </summary>
    PorteAuCompte = 5,

    /// <summary>Paid through the company's PayPal account, online.</summary>
    PayPal = 7,

    Autre = 6
}

/// <summary>
/// Money taken against one invoice.
///
/// Several per invoice on purpose: a deposit then a balance is the normal way a job gets paid,
/// and a single "paid" flag cannot say that half of it has arrived. What is still owed is the
/// invoice total minus these lines, computed rather than stored.
/// </summary>
public class InvoicePayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    public DateOnly Date { get; set; }

    /// <summary>
    /// Always positive. A refund is not a negative payment — it is its own event with its own
    /// date, and pretending otherwise makes a day's takings impossible to add up.
    /// </summary>
    public decimal Amount { get; set; }

    public PaymentMethod Method { get; set; }

    /// <summary>A cheque number, an authorisation code, a transfer reference.</summary>
    public string? Reference { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; set; }
}
