namespace Vexta.Api.Domain;

/// <summary>
/// Where a quote stands. Accepted is set by turning it into a project, never picked by hand
/// alone: an accepted quote with no job behind it is a sale nobody is going to do.
/// </summary>
public enum QuoteStatus
{
    Brouillon = 0,
    Envoyee = 1,
    Acceptee = 2,
    Refusee = 3,
    Expiree = 4
}

/// <summary>Which of the project's sections a quote line will become once the quote is accepted.</summary>
public enum QuoteLineKind
{
    /// <summary>Labour: becomes a task on the project, with its hours as the estimate.</summary>
    Tache = 0,

    /// <summary>Becomes a material line on the project, at the quoted prices.</summary>
    Materiel = 1,

    /// <summary>Becomes an extra charge on the project.</summary>
    Frais = 2
}

/// <summary>
/// A price given to a client before any work is done.
///
/// Shaped on a project on purpose — the same client, addresses, asset, filing and tax answer —
/// because an accepted quote becomes one, and every field that matches is a field nobody has to
/// type twice. It is its own table rather than a project with a status: a quote can be refused,
/// and a refused quote held among the jobs would sit in every figure that adds up the work.
/// </summary>
public class Quote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ClientId { get; set; }
    public Client? Client { get; set; }

    /// <summary>Sequential within the tenant, never reused. Displayed as S-0001.</summary>
    public int Number { get; set; }

    public string? PoNumber { get; set; }
    public string? Description { get; set; }
    public QuoteStatus Status { get; set; } = QuoteStatus.Brouillon;

    /// <summary>The day it was given, and the day the price stops holding.</summary>
    public DateOnly? IssuedOn { get; set; }
    public DateOnly? ValidUntil { get; set; }

    /// <summary>When it was last emailed to the client. Null until it has left.</summary>
    public DateTimeOffset? SentAt { get; set; }

    /// <summary>
    /// The client's own answer, given from their portal: when, who pressed the button, and what
    /// they wrote with it. Kept apart from the status because the status can still be moved by
    /// staff afterwards, and the record of what the client said should not move with it.
    /// </summary>
    public DateTimeOffset? ClientRespondedAt { get; set; }
    public string? ClientRespondedBy { get; set; }
    public string? ClientResponseNote { get; set; }

    /// <summary>
    /// The name the customer typed to sign when accepting from the portal — their signature, as
    /// they wrote it, kept apart from the account name. Printed on the PDF of the accepted quote.
    /// </summary>
    public string? ClientSignature { get; set; }

    /// <summary>
    /// The share of the price asked up front, in percent. Null for none. When the quote becomes
    /// a project, a deposit invoice for it is drafted — left for the company to check and send,
    /// because an invoice is a legal document nobody should find already sent in their name.
    /// </summary>
    public decimal? DepositPercent { get; set; }
    public Guid? DepositInvoiceId { get; set; }
    public Invoice? DepositInvoice { get; set; }

    /// <summary>The work's own planned dates, carried to the project on acceptance.</summary>
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }

    public bool IsTaxExempt { get; set; }

    public Guid? ClientAssetId { get; set; }
    public ClientAsset? ClientAsset { get; set; }

    public Guid? ClientAddressId { get; set; }
    public Address? ClientAddress { get; set; }
    public bool SameAddressAsClient { get; set; } = true;
    public Guid? SiteAddressId { get; set; }
    public Address? SiteAddress { get; set; }

    public Guid? CategoryId { get; set; }
    public ProjectCategory? Category { get; set; }
    public Guid? SubCategoryId { get; set; }
    public ProjectSubCategory? SubCategory { get; set; }
    public Guid? WageClassificationId { get; set; }
    public WageClassification? WageClassification { get; set; }

    /// <summary>
    /// The project this quote became. SetNull on delete: deleting the job must not delete the
    /// record that the price was once given and accepted.
    /// </summary>
    public Guid? ProjectId { get; set; }
    public Project? Project { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<QuoteLine> Lines { get; set; } = [];
    public List<QuoteDocument> Documents { get; set; } = [];
    public List<QuoteNote> Notes { get; set; } = [];
}

/// <summary>
/// One priced line: hours of labour, a material, or an extra charge. One table for the three
/// because they are the same arithmetic — a quantity, what it costs, what it sells for — and a
/// quote is read as one list of what the price is made of.
/// </summary>
public class QuoteLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid QuoteId { get; set; }
    public Quote? Quote { get; set; }

    public QuoteLineKind Kind { get; set; }

    /// <summary>The catalogue product a material line came from, when it came from one.</summary>
    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }

    public string? Code { get; set; }
    public required string Description { get; set; }
    public string? Unit { get; set; }

    /// <summary>Hours for labour, units for a material, 1 for most extra charges.</summary>
    public decimal Quantity { get; set; } = 1;
    public decimal? UnitCost { get; set; }
    public decimal UnitPrice { get; set; }

    /// <summary>
    /// An extra the client may take or leave (gutters, a second coat). Not in the total until
    /// chosen: <see cref="IsSelected"/> is set by the client when accepting, or by the office.
    /// </summary>
    public bool IsOptional { get; set; }
    public bool IsSelected { get; set; }

    /// <summary>In the price: every ordinary line, and the options that were chosen.</summary>
    public bool Counts => !IsOptional || IsSelected;

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A file filed against a quote: the plan the price was built from, the photos of the site, the
/// client's own request. Carried onto the project when the quote is accepted — the same file,
/// pointed at twice, never copied.
/// </summary>
public class QuoteDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid QuoteId { get; set; }
    public Quote? Quote { get; set; }

    public required string Title { get; set; }
    public string? Category { get; set; }

    public Guid MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    public Guid? UploadedById { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// One dated entry in the quote's internal thread: what the client asked for at the visit, why
/// the price was cut. Carried onto the project on acceptance, so the crew reads what was promised.
/// </summary>
public class QuoteNote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid QuoteId { get; set; }
    public Quote? Quote { get; set; }

    public required string Body { get; set; }

    public Guid? CreatedById { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A quote kept to start others from: the lines of a kind of job the company prices often.
/// Its own table rather than a flagged quote, so a template never takes a quote number, never
/// shows in the list, and never counts in the acceptance rate.
/// </summary>
public class QuoteTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Name { get; set; }
    /// <summary>The description a quote made from it starts with.</summary>
    public string? Description { get; set; }
    public decimal? DepositPercent { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<QuoteTemplateLine> Lines { get; set; } = [];
}

public class QuoteTemplateLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid TemplateId { get; set; }
    public QuoteTemplate? Template { get; set; }

    public QuoteLineKind Kind { get; set; }
    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }
    public string? Code { get; set; }
    public required string Description { get; set; }
    public string? Unit { get; set; }
    public decimal Quantity { get; set; } = 1;
    public decimal? UnitCost { get; set; }
    public decimal UnitPrice { get; set; }
    public bool IsOptional { get; set; }
    public int SortOrder { get; set; }
}
