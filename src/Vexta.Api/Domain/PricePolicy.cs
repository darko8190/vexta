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
}
