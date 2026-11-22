namespace Vexta.Api.Domain;

public class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Slug { get; set; }

    public TenantKind Kind { get; set; } = TenantKind.Business;

    /// <summary>The plan this space signed up for. Null for a free personal space.</summary>
    public Guid? PlanId { get; set; }
    public Plan? Plan { get; set; }

    public TenantSubscriptionStatus SubscriptionStatus { get; set; } = TenantSubscriptionStatus.Incomplete;
    public string? StripeCustomerId { get; set; }
    public string? StripeSubscriptionId { get; set; }
    public DateTimeOffset? CurrentPeriodEnd { get; set; }

    // ---- The company's own profile, shown on its documents and filled in by its owner ----

    public string? Description { get; set; }
    public string? ContactEmail { get; set; }
    public string? Phone { get; set; }

    /// <summary>
    /// The company's own colour, as #RRGGBB, or null to keep Vexta's blue.
    ///
    /// One colour rather than a palette: it is the only one a company can choose without being
    /// able to produce something unreadable. Every other shade the application and the invoices
    /// use — the hover state, the focus ring, the dark theme's lighter variant, the band at the
    /// top of a PDF — is derived from it, so contrast stays correct by construction.
    /// </summary>
    public string? BrandColor { get; set; }

    public TenantLogo? Logo { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ApplicationUser> Users { get; set; } = [];
    public List<Client> Clients { get; set; } = [];
}
