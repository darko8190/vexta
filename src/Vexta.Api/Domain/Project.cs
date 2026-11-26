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

    /// <summary>
    /// Which of the client's assets the work is on: the car in the bay, the building being
    /// reroofed, the furnace being serviced. Null for a job that is about no one thing.
    ///
    /// SetNull on delete: removing a car from a client's file must not delete the record of the
    /// work that was done on it.
    /// </summary>
    public Guid? ClientAssetId { get; set; }
    public ClientAsset? ClientAsset { get; set; }

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

    /// <summary>
    /// How the company files this job. Both optional and both SetNull on delete: tidying the
    /// list of categories must never take a job with it.
    /// </summary>
    public Guid? CategoryId { get; set; }
    public ProjectCategory? Category { get; set; }

    public Guid? SubCategoryId { get; set; }
    public ProjectSubCategory? SubCategory { get; set; }

    /// <summary>
    /// The pay classification the hours on this job are counted under — the sector decides the
    /// rates, and the sector is a property of the job. SetNull on delete, like the categories.
    /// </summary>
    public Guid? WageClassificationId { get; set; }
    public WageClassification? WageClassification { get; set; }

    /// <summary>
    /// The client's person for this job — who the crew calls on site. One of the client's own
    /// contacts; null for a client reached only through their main file.
    /// </summary>
    public Guid? ContactId { get; set; }
    public ClientContact? Contact { get; set; }

    /// <summary>Who this job's invoices are addressed to, among the client's contacts.</summary>
    public Guid? BillingContactId { get; set; }
    public ClientContact? BillingContact { get; set; }

    /// <summary>
    /// How often this job comes back: every <see cref="RecurrenceEvery"/> of
    /// <see cref="RecurrenceUnit"/>. Null for a one-off job. The project carrying it is the
    /// model; each occurrence is a new project copied from it (see ProjectRecurrenceService).
    /// </summary>
    public int? RecurrenceEvery { get; set; }
    public RecurrenceUnit RecurrenceUnit { get; set; } = RecurrenceUnit.Mois;

    /// <summary>The start date of the next copy. Stored to be queried.</summary>
    public DateOnly? RecurrenceNextDate { get; set; }

    /// <summary>No copy starts after this day; null for until stopped.</summary>
    public DateOnly? RecurrenceEndDate { get; set; }

    /// <summary>On a copy: the model it was made from, so the two can be found from each other.</summary>
    public Guid? RecurringFromId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Invoice> Invoices { get; set; } = [];
    public List<ProjectExpense> Expenses { get; set; } = [];
    public List<ProjectExtraCharge> ExtraCharges { get; set; } = [];
    public List<ProjectMaterial> Materials { get; set; } = [];
    public List<ProjectEquipment> EquipmentUsed { get; set; } = [];
    public List<TimesheetEntry> Timesheets { get; set; } = [];
    public List<ProjectDocument> Documents { get; set; } = [];
    public List<ProjectNote> Notes { get; set; } = [];
    public List<ProjectTask> Tasks { get; set; } = [];
}
