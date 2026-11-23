namespace Vexta.Api.Domain;

/// <summary>
/// Something added to a job's bill that was not in the quote: a trip back for a forgotten part,
/// an hour of overtime, a surcharge for working a Saturday.
///
/// It is shaped like <see cref="ProjectExpense"/> and deliberately carries no photographs. An
/// expense is proved by its receipt — the receipt *is* the expense. An extra charge is a decision
/// the company made, so there is nothing to photograph, and a camera button on this form would
/// invite people to file receipts where the cost table cannot see them.
///
/// It also carries no category. A company's expense categories answer "what kind of spending was
/// this" for the books; an extra charge is described by its own line, and inventing a second
/// taxonomy nobody asked to maintain is how a form grows a required field that always says
/// "Autre".
/// </summary>
public class ProjectExtraCharge
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    /// <summary>What it is, in a few words. This is the line people read in the list.</summary>
    public required string Name { get; set; }

    public string? Description { get; set; }

    /// <summary>
    /// What it cost the company, and what the client is billed for it. Both optional for the
    /// same reason as on an expense: the charge is agreed on site before anyone has worked out
    /// the margin, and refusing to save it until then is how it gets forgotten entirely.
    /// </summary>
    public decimal? Cost { get; set; }
    public decimal? SellingPrice { get; set; }

    /// <summary>The day it was incurred, which is rarely the day the row is created.</summary>
    public DateOnly? ChargedOn { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
