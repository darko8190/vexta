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
    string Name,
    string? PoNumber,
    string? Description,
    ProjectStatus Status,
    DateOnly? StartDate,
    DateOnly? EndDate,
    decimal? Budget,
    ProjectAddressDto? ClientAddress,
    bool SameAddressAsClient,
    /// <summary>Null when the work happens at the billing address — see SameAddressAsClient.</summary>
    ProjectAddressDto? SiteAddress,
    int InvoiceCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record UpsertProjectRequest(
    Guid ClientId,
    string Name,
    string? PoNumber,
    string? Description,
    ProjectStatus Status,
    DateOnly? StartDate,
    DateOnly? EndDate,
    decimal? Budget,
    Guid? ClientAddressId,
    bool SameAddressAsClient,
    /// <summary>Ignored when SameAddressAsClient is true.</summary>
    Guid? SiteAddressId);
