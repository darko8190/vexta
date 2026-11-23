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

    /// <summary>
    /// When the free trial runs out, for a space that opened on a plan offering one. Null for
    /// everyone else, including a company that has since subscribed — paying ends the trial, and
    /// a date left behind would make a paid-up space look like it is about to expire.
    /// </summary>
    public DateTimeOffset? TrialEndsAt { get; set; }

    /// <summary>
    /// The company asked to stop. Stripe keeps the subscription running to the end of the
    /// period already paid for, so the space stays open until <see cref="CurrentPeriodEnd"/>
    /// and then lapses on its own.
    ///
    /// Stored here as well as in Stripe because this is what the settings screen reads: asking
    /// Stripe on every page load would make an unsubscribe button that sometimes says nothing
    /// happened, and the webhook keeps the two in step.
    /// </summary>
    public bool CancelAtPeriodEnd { get; set; }

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
