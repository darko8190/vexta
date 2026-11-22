namespace Vexta.Api.Domain;

/// <summary>
/// Why a line is on the client's account. The amount carries the direction; this says what
/// happened, which is what the statement prints and what tells a charge from a credit note.
/// </summary>
public enum AccountEntryKind
{
    /// <summary>An invoice was put on the account instead of being paid.</summary>
    Charge = 0,

    /// <summary>Money received against the account.</summary>
    Paiement = 1,

    /// <summary>A correction, a credit note, an opening balance — anything entered by hand.</summary>
    Ajustement = 2
}

/// <summary>
/// One line on a client's running account: what they were charged, what they paid, and what
/// somebody corrected by hand.
///
/// The balance is the sum of these lines and is never stored anywhere. A stored balance and a
/// list of entries are two things that must agree, and eventually they do not — usually after
/// the one write that failed halfway.
/// </summary>
public class ClientAccountEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ClientId { get; set; }
    public Client? Client { get; set; }

    public DateOnly Date { get; set; }

    public AccountEntryKind Kind { get; set; }

    /// <summary>
    /// Signed, and that is the whole arithmetic: positive is what the client owes more of,
    /// negative is what reduces it. So the balance is one SUM and no case analysis.
    ///
    /// The forms never show a minus sign — they ask for an amount and the kind decides the
    /// sign — because a field where the sign matters is a field somebody gets backwards.
    /// </summary>
    public decimal Amount { get; set; }

    public required string Description { get; set; }

    /// <summary>
    /// The invoice this came from, when it came from one. SetNull on delete: the client still
    /// owes the money after somebody deletes a draft, and an account that quietly rebalances
    /// itself when a document is tidied up is an account nobody can reconcile.
    /// </summary>
    public Guid? InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    /// <summary>The payment that created it, for the same reason and with the same rule.</summary>
    public Guid? InvoicePaymentId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Who entered it. An id rather than a name: the account may be gone by the time it is read.</summary>
    public Guid? CreatedByUserId { get; set; }
}
