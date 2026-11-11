using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

public record ProjectDto(
    Guid Id,
    Guid ClientId,
    string ClientName,
    string Name,
    string? Description,
    ProjectStatus Status,
    DateOnly? StartDate,
    DateOnly? EndDate,
    decimal? Budget,
    int InvoiceCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record UpsertProjectRequest(
    Guid ClientId,
    string Name,
    string? Description,
    ProjectStatus Status,
    DateOnly? StartDate,
    DateOnly? EndDate,
    decimal? Budget);
