using Vexta.Api.Domain;

namespace Vexta.Api.Features.Clients;

public record ClientDto(
    Guid Id,
    /// <summary>Sequential within the tenant. Shown as C-0001.</summary>
    int Number,
    string Type,
    string? CompanyName,
    string? FirstName,
    string? LastName,
    /// <summary>The company for an entreprise, the person for a particulier.</summary>
    string Name,
    string? Email,
    string? Phone,
    string? TaxId,
    string? Notes,
    /// <summary>The primary address, flattened for the form. Null when none is on file.</summary>
    ClientAddressDto? PrimaryAddress,
    int AddressCount,
    int ContactCount,
    int ProjectCount,
    int InvoiceCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <summary>
/// The address fields as the client form asks for them. They are stored in the Addresses table
/// like any other, flagged primary — one place where a client's addresses live, not two.
/// </summary>
public record ClientAddressDto(
    Guid? Id,
    string Line1,
    /// <summary>Apartment or suite. Line2 in the address table.</summary>
    string? Apartment,
    string City,
    string? Province,
    string PostalCode,
    string Country);

public record ClientSummaryDto(Guid Id, string Name, string? Email);

public record UpsertClientRequest(
    ClientType Type,
    string? CompanyName,
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? TaxId,
    string? Notes,
    /// <summary>Omitted or blank leaves the primary address untouched.</summary>
    ClientAddressDto? PrimaryAddress);

// ---- Contacts attached to a client ----

public record ClientContactDto(
    Guid Id,
    Guid ClientId,
    string FirstName,
    string LastName,
    string? Role,
    string? Email,
    string? Phone,
    string? Notes,
    DateTimeOffset CreatedAt);

public record UpsertClientContactRequest(
    string FirstName,
    string LastName,
    string? Role,
    string? Email,
    string? Phone,
    string? Notes);
