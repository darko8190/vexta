namespace Vexta.Api.Domain;

/// <summary>
/// A material posted on a job: so many sheets of plywood, so many feet of pipe.
///
/// It is a line, not a link to a product. The product it was taken from is kept so the
/// catalogue can be re-read, but the code, the description, the unit and the three prices are
/// copied onto the row: what a job consumed is a historical fact, and a catalogue that gets
/// retitled or repriced next spring must not rewrite last autumn's job.
/// </summary>
public class ProjectMaterial
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    /// <summary>
    /// The task on this job that this line belongs to, or null for something posted against the
    /// job as a whole.
    ///
    /// Optional on purpose. Not every hour and not every bag of concrete belongs to a named
    /// task, and forcing a choice would get a made-up answer — which is worse than no answer,
    /// because a task's total would then be wrong rather than merely incomplete. What it buys
    /// when it is filled in is the figure nobody could produce before: what one task actually
    /// cost, what it sold for, and the difference.
    ///
    /// SetNull on delete: removing a task from the plan must not take the hours or the money
    /// spent while it existed.
    /// </summary>
    public Guid? ProjectTaskId { get; set; }
    public ProjectTask? ProjectTask { get; set; }

    /// <summary>
    /// The catalogue entry this came from, or null for something typed in by hand. SetNull
    /// when the product is deleted — the line stays, because the material was still used.
    /// </summary>
    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }

    /// <summary>The product's code as it stood, which is what the search column shows.</summary>
    public string? Code { get; set; }

    public required string Description { get; set; }

    /// <summary>un, pi, m, sac — copied from the product, editable here.</summary>
    public string? Unit { get; set; }

    public decimal Quantity { get; set; } = 1;

    /// <summary>What it cost the company.</summary>
    public decimal? PurchasePrice { get; set; }

    /// <summary>In percent, applied the way the company's MarginMode says.</summary>
    public decimal? MarginPercent { get; set; }

    /// <summary>What the client is charged per unit. The line total is this times the quantity,
    /// computed rather than stored: two columns that must agree eventually do not.</summary>
    public decimal UnitPrice { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
