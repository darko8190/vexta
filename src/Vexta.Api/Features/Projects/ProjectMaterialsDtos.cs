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
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
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
    decimal UnitPrice);
