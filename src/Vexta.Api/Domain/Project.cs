namespace Vexta.Api.Domain;

public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ClientId { get; set; }
    public Client? Client { get; set; }

    /// <summary>
    /// Sequential within the tenant and never chosen by hand, like a client's. Displayed as
    /// P-0001; stored as the number alone so sorting and the next value stay arithmetic.
    /// </summary>
    public int Number { get; set; }

    /// <summary>The client's own purchase order, printed on the invoices for this project.</summary>
    public string? PoNumber { get; set; }

    /// <summary>
    /// What the work is, in a line or two. A project is identified by its number and its
    /// client — it carries no name of its own, because on paper nobody quotes one.
    /// </summary>
    public string? Description { get; set; }
    public ProjectStatus Status { get; set; } = ProjectStatus.AFaire;

    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public decimal? Budget { get; set; }

    /// <summary>
    /// No tax on this job. Taken from the client when the project is created and then owned by
    /// the project: the same client can have one job that qualifies and one that does not.
    /// </summary>
    public bool IsTaxExempt { get; set; }

    /// <summary>
    /// The margin applied to catalogue lines on this job. Null falls back to the company's
    /// default policy, which is what most projects use.
    /// </summary>
    public Guid? PricePolicyId { get; set; }
    public PricePolicy? PricePolicy { get; set; }

    /// <summary>Which of the client's addresses to bill. Null when none is on file yet.</summary>
    public Guid? ClientAddressId { get; set; }
    public Address? ClientAddress { get; set; }

    /// <summary>
    /// True when the work happens where the invoice goes, which is the common case. The site
    /// address is then not stored twice — <see cref="SiteAddressId"/> stays null and the billing
    /// one answers for both, so moving the client never leaves a stale copy behind.
    /// </summary>
    public bool SameAddressAsClient { get; set; } = true;

    /// <summary>Where the work happens, when it is not where the invoice goes.</summary>
    public Guid? SiteAddressId { get; set; }
    public Address? SiteAddress { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Invoice> Invoices { get; set; } = [];
    public List<ProjectExpense> Expenses { get; set; } = [];
    public List<ProjectMaterial> Materials { get; set; } = [];
    public List<TimesheetEntry> Timesheets { get; set; } = [];
    public List<ProjectDocument> Documents { get; set; } = [];
    public List<ProjectNote> Notes { get; set; } = [];
    public List<ProjectTask> Tasks { get; set; } = [];
}
