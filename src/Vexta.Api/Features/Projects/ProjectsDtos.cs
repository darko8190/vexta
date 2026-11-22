using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>An address as a project shows it: enough to recognise, not the whole record.</summary>
public record ProjectAddressDto(Guid Id, string Line1, string? Line2, string City, string? Province, string PostalCode);

public record ProjectDto(
    Guid Id,
    /// <summary>Sequential within the tenant. Shown as P-0001.</summary>
    int Number,
    Guid ClientId,
    string ClientName,
    string? PoNumber,
    string? Description,
    ProjectStatus Status,
    DateOnly? StartDate,
    DateOnly? EndDate,
    decimal? Budget,
    /// <summary>No tax on this job. Defaulted from the client, then owned by the project.</summary>
    bool IsTaxExempt,
    /// <summary>The margin applied to catalogue lines on this job, if one was chosen.</summary>
    Guid? PricePolicyId,
    string? PricePolicyName,
    ProjectAddressDto? ClientAddress,
    bool SameAddressAsClient,
    /// <summary>Null when the work happens at the billing address — see SameAddressAsClient.</summary>
    ProjectAddressDto? SiteAddress,
    int InvoiceCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record UpsertProjectRequest(
    Guid ClientId,
    string? PoNumber,
    string? Description,
    ProjectStatus Status,
    DateOnly? StartDate,
    DateOnly? EndDate,
    decimal? Budget,
    /// <summary>Null means "take the client's answer", which is what a new project does.</summary>
    bool? IsTaxExempt,
    /// <summary>Null leaves the company's default policy to answer for this job.</summary>
    Guid? PricePolicyId,
    Guid? ClientAddressId,
    bool SameAddressAsClient,
    /// <summary>Ignored when SameAddressAsClient is true.</summary>
    Guid? SiteAddressId);

// ---- What the project's own page needs beyond the record itself ----

/// <summary>
/// How many rows sit behind each of the project's sections, so the navigation can say so before
/// anything is opened. Every section is counted in one round trip rather than one request per
/// badge: six requests to draw a menu is six chances to show a half-filled one.
/// </summary>
public record ProjectSectionCountsDto(
    /// <summary>Only the work still open. A finished task is no longer something to do.</summary>
    int OpenTasks,
    int Materials,
    int Equipment,
    int Assemblies,
    int Timesheets,
    int Expenses,
    int ExtraCharges,
    /// <summary>Files and written notes together: they share one section, so they share a badge.</summary>
    int DocumentsAndNotes,
    int Invoices);

/// <summary>
/// One line of the project's cost table: what the category cost the company, what the client is
/// billed for it, and the difference. The profit is computed here rather than in the browser so
/// the printed figure and the displayed one are the same arithmetic.
/// </summary>
public record ProjectCostLineDto(string Key, string Label, decimal Cost, decimal Revenue)
{
    public decimal Profit => Revenue - Cost;
}

/// <summary>
/// The project's money, as the Détails section shows it. Taxes are named rather than numbered
/// so the table reads TPS / TVQ for a Québec company and keeps whatever the settings say for
/// anyone else; an exempt project returns them at zero with the reason attached.
/// </summary>
public record ProjectCostTableDto(
    IReadOnlyList<ProjectCostLineDto> Lines,
    decimal TotalCost,
    decimal Subtotal,
    decimal Profit,
    string Tax1Label,
    decimal Tax1,
    string Tax2Label,
    decimal Tax2,
    decimal Total,
    bool IsTaxExempt);

public record ProjectSummaryDto(ProjectSectionCountsDto Counts, ProjectCostTableDto Costs);
