using Vexta.Api.Domain;

namespace Vexta.Api.Features.Clients;

// ---- Actifs ----

public record ClientAssetDto(
    Guid Id,
    string Label,
    /// <summary>"Toyota Corolla 2018", or the label when the make and model were never filled.</summary>
    string Designation,
    string? Category,
    string? Make,
    string? Model,
    int? Year,
    string? SerialNumber,
    string? Reference,
    decimal? Usage,
    string? UsageUnit,
    Guid? AddressId,
    /// <summary>The address on one line, which is all a list has room for.</summary>
    string? AddressLine,
    string? Notes,
    bool IsActive,
    DateTimeOffset CreatedAt);

public record SaveClientAssetRequest(
    string Label,
    string? Category = null,
    string? Make = null,
    string? Model = null,
    int? Year = null,
    string? SerialNumber = null,
    string? Reference = null,
    decimal? Usage = null,
    string? UsageUnit = null,
    Guid? AddressId = null,
    string? Notes = null,
    bool IsActive = true);

// ---- Compte ----

public record ClientAccountEntryDto(
    Guid Id,
    DateOnly Date,
    AccountEntryKind Kind,
    /// <summary>Signed: positive is owed, negative reduces the balance. See ClientAccountEntry.</summary>
    decimal Amount,
    string Description,
    Guid? InvoiceId,
    string? InvoiceNumber,
    DateTimeOffset CreatedAt);

/// <summary>
/// The statement: the balance, the two running totals behind it, why the account is barred if
/// it is, and the lines.
/// </summary>
public record ClientAccountDto(
    decimal Balance,
    decimal TotalCharged,
    decimal TotalPaid,
    bool IsBlocked,
    string? BlockedReason,
    bool IsAccountBlocked,
    string? AccountBlockedReason,
    IReadOnlyList<ClientAccountEntryDto> Entries);

public record SaveAccountEntryRequest(
    AccountEntryKind Kind,
    /// <summary>Always positive. The kind decides the sign — see ClientAccountController.Signed.</summary>
    decimal Amount,
    string Description,
    DateOnly? Date = null,
    /// <summary>Only read for an Ajustement, where the direction is the person's to choose.</summary>
    bool ReducesBalance = false);

// ---- Blocage ----

public record BlockClientRequest(bool IsBlocked, string? Reason);

public record BlockAccountRequest(bool IsBlocked, string? Reason);
