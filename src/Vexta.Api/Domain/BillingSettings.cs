namespace Vexta.Api.Domain;

/// <summary>
/// What a company must decide before it can invoice anyone: how its invoices are numbered, what
/// tax it charges, when it expects to be paid and what it prints at the bottom.
///
/// The row existing is what says the company has been through this once. That is the gate on
/// creating an invoice — not a guess at whether the fields look filled, because several of them
/// are legitimately empty: a supplier under the registration threshold has no GST number, and
/// saying so is a decision too.
/// </summary>
public class BillingSettings
{
    /// <summary>The key: one set of settings per company, no id of its own.</summary>
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    /// <summary>Registration numbers, printed on the invoice. Empty when not registered.</summary>
    public string? GstNumber { get; set; }
    public string? QstNumber { get; set; }

    /// <summary>
    /// The RBQ licence, printed under the company's address. Required on a construction
    /// invoice in Québec and meaningless everywhere else, which is why it is optional.
    /// </summary>
    public string? RbqNumber { get; set; }

    /// <summary>Rates in percent, applied to a new line by default. Québec: 5 and 9.975.</summary>
    public decimal GstRate { get; set; } = 5m;
    public decimal QstRate { get; set; } = 9.975m;

    /// <summary>
    /// What the company bills in. It lives here rather than on each invoice form: a company
    /// bills in one currency, and a field asked once per invoice is a field nobody changes and
    /// anybody can get wrong. Each invoice still stores the answer that was in force when it
    /// was issued, so a currency change never rewrites what was already sent.
    /// </summary>
    public string Currency { get; set; } = "CAD";

    /// <summary>F-0001. The prefix is the company's, the counter is ours.</summary>
    public string InvoicePrefix { get; set; } = "F";

    /// <summary>
    /// The next number to hand out, not a count of what exists: deleting an invoice must never
    /// give its number to another one. An invoice number is a reference people quote.
    /// </summary>
    public int NextInvoiceNumber { get; set; } = 1;

    /// <summary>
    /// NC-0001. A credit note is numbered from its own counter: sharing the invoices' would
    /// leave holes in the invoice sequence, and a gap there is the first thing an auditor asks
    /// about.
    /// </summary>
    public string CreditPrefix { get; set; } = "NC";

    /// <summary>Same rule as the invoices': never reused, even after a deletion.</summary>
    public int NextCreditNumber { get; set; } = 1;

    /// <summary>
    /// What an hour of labour is charged at by default. The starting point for a Main-d'œuvre
    /// line, not a ceiling — a line can always be priced differently.
    /// </summary>
    public decimal? DefaultHourlyRate { get; set; }

    /// <summary>
    /// How a purchase price becomes a selling price here. Both conventions are called "la
    /// marge" on site and they give different numbers, so the company says which one it means
    /// once rather than per product.
    /// </summary>
    public MarginMode MarginMode { get; set; } = MarginMode.Multiplication;

    /// <summary>The policy used by a project or an invoice that names none.</summary>
    public Guid? DefaultPricePolicyId { get; set; }
    public PricePolicy? DefaultPricePolicy { get; set; }

    /// <summary>Days between issue and due date, used to fill the date in.</summary>
    public int PaymentTermsDays { get; set; } = 30;

    /// <summary>
    /// The subject and the message an invoice is emailed with, with fields like {{numero}}
    /// filled in at send time. Null means "use the built-in wording", which is why neither is
    /// defaulted to a copy of it: a company that never touched this screen should get the
    /// improved default wording rather than a frozen snapshot of today's.
    /// </summary>
    public string? InvoiceEmailSubject { get; set; }
    public string? InvoiceEmailBody { get; set; }

    /// <summary>Payment conditions, as printed.</summary>
    public string? Terms { get; set; }

    /// <summary>The line at the bottom: late fees, how to pay, a thank you.</summary>
    public string? FooterNote { get; set; }

    /// <summary>
    /// When the company last saved its billing card — its taxes, its numbering, its terms.
    ///
    /// This, not the row existing, is what unlocks invoicing. The row is now created by other
    /// screens too (an hourly rate, a margin mode), and letting any of them stand in for
    /// "we have settled our taxes" would put guessed Québec rates on a real invoice from a
    /// company that never looked at them.
    /// </summary>
    public DateTimeOffset? ConfiguredAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
