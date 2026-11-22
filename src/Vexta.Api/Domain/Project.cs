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

    public required string Name { get; set; }
    public string? Description { get; set; }
    public ProjectStatus Status { get; set; } = ProjectStatus.Planifie;

    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public decimal? Budget { get; set; }

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
}
