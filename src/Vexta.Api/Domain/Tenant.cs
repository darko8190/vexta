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

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ApplicationUser> Users { get; set; } = [];
    public List<Client> Clients { get; set; } = [];
}
