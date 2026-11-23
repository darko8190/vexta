namespace Vexta.Api.Domain;

/// <summary>
/// A named way of pricing: "Résidentiel 35 %", "Commercial 25 %", "Prix coûtant".
///
/// A company rarely charges one margin to everyone. The policy is chosen on a project or an
/// invoice, and it is what turns a product's purchase price into the line's selling price —
/// so changing who the work is for changes the prices without anyone retyping them.
///
/// The product's own margin is the fallback, not the rule: a policy says what this customer
/// pays, the product says what it is normally worth.
/// </summary>
public class PricePolicy
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Name { get; set; }

    /// <summary>
    /// In percent, applied the way the company's <see cref="MarginMode"/> says. Zero is a
    /// legitimate policy — selling at cost is how a contractor bills a client's own materials.
    /// </summary>
    public decimal MarginPercent { get; set; }

    public string? Description { get; set; }

    /// <summary>
    /// Used by a project or an invoice that names no policy. Exactly one row may carry it, which
    /// the controller enforces by clearing the others rather than by refusing the save.
    /// </summary>
    public bool IsDefault { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<PricePolicyTier> Tiers { get; set; } = [];
}

/// <summary>
/// One band of a policy: "de 1 $ a 5 $, 60 %".
///
/// A contractor does not charge the same percentage on a 2 $ box of screws as on a 2 000 $
/// window. The cheap end carries the handling — the trip to the counter costs the same either
/// way — so the margin there is high, and it comes down as the price goes up.
///
/// The band is read against the PURCHASE price, not the selling price. It has to be: the margin
/// is what turns the cost into the price, so a band on the price would need the answer before it
/// could pick the rule that produces it.
///
/// A cost that falls in no band is priced at the policy's own <see cref="PricePolicy.MarginPercent"/>.
/// That is what makes a policy with no bands behave exactly as it did before they existed.
/// </summary>
public class PricePolicyTier
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid PricePolicyId { get; set; }
    public PricePolicy? PricePolicy { get; set; }

    /// <summary>Inclusive. Zero is legitimate — it is where the first band starts.</summary>
    public decimal FromAmount { get; set; }

    /// <summary>
    /// Inclusive, and null for the last band, which means "and everything above". Null rather
    /// than a very large number: a company that writes 999 999 as its ceiling has quietly
    /// decided that the one item above it has no margin at all.
    /// </summary>
    public decimal? ToAmount { get; set; }

    public decimal MarginPercent { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
