namespace Vexta.Api.Domain;

/// <summary>
/// Something bought or paid for on a job: a permit, a dumpster, a night in a motel, parking.
///
/// It carries its own photographs because that is how an expense is proved — the receipt is the
/// expense, and asking someone on site to file it anywhere else means it never gets filed.
/// </summary>
public class ProjectExpense
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    /// <summary>What it was, in a few words. This is the line people read in the list.</summary>
    public required string Name { get; set; }

    public string? Description { get; set; }

    /// <summary>
    /// The kind of expense, chosen from the company's own list. A row rather than an enum
    /// because every trade keeps a different set and adds to it as it goes.
    /// </summary>
    public Guid ExpenseTypeId { get; set; }
    public ExpenseType? ExpenseType { get; set; }

    /// <summary>
    /// What it cost the company, and what the client is billed for it. Both optional: a receipt
    /// is often filed on site before anyone has decided what to charge for it, and refusing to
    /// save the expense until then is how receipts get lost. They are what the project's cost
    /// table adds up.
    /// </summary>
    public decimal? Cost { get; set; }
    public decimal? SellingPrice { get; set; }

    /// <summary>The day the money went out, which is rarely the day the row is created.</summary>
    public DateOnly? SpentOn { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ProjectExpensePhoto> Photos { get; set; } = [];
}

/// <summary>
/// One of the company's expense categories. Created from the dropdown that uses it, because
/// stopping to go and configure a list is what makes people pick the wrong category instead.
/// </summary>
public class ExpenseType
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Name { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ProjectExpense> Expenses { get; set; } = [];
}

/// <summary>
/// A photograph of an expense — the receipt, the invoice from the supplier, the parking stub.
/// The bytes live in R2 through <see cref="MediaAsset"/>; this row is what ties them to the
/// expense and keeps their order.
/// </summary>
public class ProjectExpensePhoto
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ExpenseId { get; set; }
    public ProjectExpense? Expense { get; set; }

    public Guid MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
