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

    /// <summary>Rates in percent, applied to a new line by default. Québec: 5 and 9.975.</summary>
    public decimal GstRate { get; set; } = 5m;
    public decimal QstRate { get; set; } = 9.975m;

    /// <summary>F-0001. The prefix is the company's, the counter is ours.</summary>
    public string InvoicePrefix { get; set; } = "F";

    /// <summary>
    /// The next number to hand out, not a count of what exists: deleting an invoice must never
    /// give its number to another one. An invoice number is a reference people quote.
    /// </summary>
    public int NextInvoiceNumber { get; set; } = 1;

    /// <summary>Days between issue and due date, used to fill the date in.</summary>
    public int PaymentTermsDays { get; set; } = 30;

    /// <summary>Payment conditions, as printed.</summary>
    public string? Terms { get; set; }

    /// <summary>The line at the bottom: late fees, how to pay, a thank you.</summary>
    public string? FooterNote { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
