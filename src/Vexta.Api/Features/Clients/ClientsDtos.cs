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
    /// <summary>
    /// Prospect, Client or Ancien. Never "Banni" — a barred client is one the lock below says
    /// is barred, and the screen reads the two together so they cannot contradict each other.
    /// </summary>
    string Status,
    string? Email,
    string? Phone,
    string? TaxId,
    string? Notes,
    /// <summary>No tax charged to this client. The default for their projects and invoices.</summary>
    bool IsTaxExempt,
    /// <summary>The primary address, flattened for the form. Null when none is on file.</summary>
    ClientAddressDto? PrimaryAddress,
    int AddressCount,
    int ContactCount,
    int ProjectCount,
    int InvoiceCount,
    int AssetCount,
    /// <summary>
    /// What this client owes on their account. Positive is owed; negative is a credit they are
    /// holding. Summed from the account's own lines, which are the only record of it.
    /// </summary>
    decimal AccountBalance,
    /// <summary>Barred outright: no new project, no new invoice, nothing ordered publicly.</summary>
    bool IsBlocked,
    string? BlockedReason,
    /// <summary>The account is barred but the client is not: they pay as they go.</summary>
    bool IsAccountBlocked,
    string? AccountBlockedReason,
    /// <summary>Whether this particulier can sign in to see their own files, and where they are.</summary>
    ClientAccessDto Access,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    /// <summary>The contact responsible for billing, or null for the person on the record.</summary>
    Guid? BillingContactId = null,
    /// <summary>Who that is, worked out either way, so a screen never has to.</summary>
    string? BillingContactName = null);

/// <summary>
/// The state of one person's access, in the three forms it can take: none, invited but never
/// accepted, and active. The UI needs all three because each offers a different action — invite,
/// resend, revoke.
/// </summary>
public record ClientAccessDto(
    bool HasAccess,
    bool InvitationPending,
    DateTimeOffset? InvitationExpiresAt,
    DateTimeOffset? InvitationSentAt);

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

public record ClientSummaryDto(Guid Id, int Number, string Name, string? Email);

/// <summary>
/// The invitation link is returned whether or not the email went out: Mailgun is optional, and
/// an invitation nobody can deliver is an invitation nobody can accept.
/// </summary>
public record ClientAccessGrantedDto(string? InvitationUrl, DateTimeOffset? ExpiresAt, bool EmailSent);

public record UpsertClientRequest(
    ClientType Type,
    string? CompanyName,
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? TaxId,
    string? Notes,
    bool IsTaxExempt,
    /// <summary>Omitted or blank leaves the primary address untouched.</summary>
    ClientAddressDto? PrimaryAddress,
    /// <summary>
    /// Defaults to Client when a caller says nothing, which is what the form does for a record
    /// typed in because work is about to start — the common case.
    /// </summary>
    ClientStatus Status = ClientStatus.Client,
    /// <summary>One of this client's contacts, or null for the person on the record.</summary>
    Guid? BillingContactId = null);

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
    ClientAccessDto Access,
    DateTimeOffset CreatedAt);

public record UpsertClientContactRequest(
    string FirstName,
    string LastName,
    string? Role,
    string? Email,
    string? Phone,
    string? Notes);
