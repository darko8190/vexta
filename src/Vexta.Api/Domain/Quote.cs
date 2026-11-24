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

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
