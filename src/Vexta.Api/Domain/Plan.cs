namespace Vexta.Api.Domain;

/// <summary>
/// A subscription tier the super admin publishes. The amount here is what the public site shows;
/// <see cref="StripePriceId"/> is what Stripe actually charges, and the two are written together.
/// </summary>
public class Plan
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public required string Name { get; set; }
    public string? Description { get; set; }

    public long AmountCents { get; set; }
    public string Currency { get; set; } = "CAD";

    /// <summary>
    /// Null until Stripe is configured and a price could be created. A plan without one cannot be
    /// published: showing a price nobody can be charged is worse than showing no plan at all.
    /// </summary>
    public string? StripePriceId { get; set; }

    public bool IsPublished { get; set; }
    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Module> Modules { get; set; } = [];
    public List<Tenant> Tenants { get; set; } = [];
}
