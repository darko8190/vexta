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

    /// <summary>
    /// The floor of the plan's user range, shown on the pricing page so a buyer can see at a
    /// glance which tier is meant for their size. It is not enforced: nothing can oblige a
    /// company to create accounts it does not want, and refusing to let them under their own
    /// floor would only lock the owner out of their own space.
    /// </summary>
    public int MinUsers { get; set; } = 1;

    /// <summary>
    /// The ceiling, and the one that is enforced: how many people can sign in at once, the owner
    /// included. A tenant whose plan allows 5 gets 5 accounts in total, not 5 on top of the
    /// admin — that is what the buyer reads on the pricing page, and selling 5 while delivering
    /// 6 is a promise nobody made.
    /// </summary>
    public int MaxUsers { get; set; } = 1;

    /// <summary>
    /// How many receipts this plan's tenants may have read by a model each month.
    ///
    /// The only metered thing Vexta sells, so it is sold rather than given: a scan costs real
    /// money per use (see <see cref="ReceiptScan"/>), and an unlimited allowance is a bill that
    /// grows with somebody else's habits. Zero turns the feature off for the plan, which is the
    /// honest way to offer it on a cheap tier rather than letting people find a refusal.
    ///
    /// 100 on a new plan, which is a month of receipts for a small crew and a few dollars.
    /// Plans that existed before the column were set to zero rather than switched on behind
    /// their owner's back — see the AddReceiptScans migration.
    /// </summary>
    public int MonthlyReceiptScans { get; set; } = 100;

    public bool IsPublished { get; set; }
    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Module> Modules { get; set; } = [];

    /// <summary>
    /// What this plan lets its companies do, as opposed to what it lets them open. See
    /// <see cref="Feature"/> for why the two are different lists.
    /// </summary>
    public List<Feature> Features { get; set; } = [];

    public List<Tenant> Tenants { get; set; } = [];
}
