namespace Vexta.Api.Features.Projects;

/// <summary>
/// A material line as the project's table shows it.
///
/// The total is a getter rather than a column: it is the quantity times the selling price and
/// nothing else, so computing it here keeps the one figure everybody reads out of reach of
/// drifting from the two it is made of.
/// </summary>
public record ProjectMaterialDto(
    Guid Id,
    Guid? ProductId,
    string? Code,
    string Description,
    string? Unit,
    decimal Quantity,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    decimal UnitPrice,
    int SortOrder,
    /// <summary>
    /// The task on this job it belongs to, and that task's title for the list. Both null for a
    /// line posted against the job as a whole, which is most of them.
    /// </summary>
    Guid? ProjectTaskId,
    string? ProjectTaskTitle,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    /// <summary>The assembly that brought it: its quantity follows the assembly, its money is the assembly's.</summary>
    Guid? ProjectAssemblyId = null,
    string? ProjectAssemblyName = null)
{
    public decimal Total => Quantity * UnitPrice;
}

/// <param name="ProductId">
/// The catalogue entry the line was taken from, or null for something typed by hand. The code,
/// the description, the unit and the prices are still sent: picking a product fills the row in
/// and then the row is edited, and what the job consumed is what the row says, not what the
/// catalogue says today.
/// </param>
public record SaveProjectMaterialRequest(
    Guid? ProductId,
    string? Code,
    string Description,
    string? Unit,
    decimal Quantity,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    decimal UnitPrice,
    /// <summary>Optional: the task this material was used on.</summary>
    Guid? ProjectTaskId = null);
