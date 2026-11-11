namespace Vexta.Api.Features.Clients;

public record ClientDto(
    Guid Id,
    string Name,
    string? Email,
    string? Phone,
    string? TaxId,
    string? Notes,
    int AddressCount,
    int ProjectCount,
    int InvoiceCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record ClientSummaryDto(Guid Id, string Name, string? Email);

public record UpsertClientRequest(string Name, string? Email, string? Phone, string? TaxId, string? Notes);
