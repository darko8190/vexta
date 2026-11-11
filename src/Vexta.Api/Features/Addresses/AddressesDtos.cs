using Vexta.Api.Domain;

namespace Vexta.Api.Features.Addresses;

public record AddressDto(
    Guid Id,
    Guid ClientId,
    string ClientName,
    AddressType Type,
    bool IsPrimary,
    string Line1,
    string? Line2,
    string City,
    string? Province,
    string PostalCode,
    string Country,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record UpsertAddressRequest(
    Guid ClientId,
    AddressType Type,
    bool IsPrimary,
    string Line1,
    string? Line2,
    string City,
    string? Province,
    string PostalCode,
    string Country);
