namespace Vexta.Api.Features.Team;

public record EmployeeDto(
    Guid Id,
    string FirstName,
    string LastName,
    string Email,
    string? JobTitle,
    string? Phone,
    /// <summary>True once a sign-in account exists. This is what the seat limit counts.</summary>
    bool HasAccess,
    /// <summary>Access granted but the password never chosen: the invitation is still outstanding.</summary>
    bool InvitationPending,
    /// <summary>True when the outstanding invitation has run out and needs to be resent.</summary>
    bool InvitationExpired,
    DateTimeOffset? InvitationSentAt,
    DateTimeOffset? InvitationExpiresAt,
    /// <summary>
    /// The person who opened the company. Their access is theirs by definition: it cannot be
    /// unticked and their record cannot be deleted, because both would take the account that
    /// owns the space down with them.
    /// </summary>
    bool IsOwner,
    DateTimeOffset CreatedAt);

/// <summary>One employee's own page: the record, plus the teams they are on.</summary>
public record EmployeeDetailDto(EmployeeDto Employee, IReadOnlyList<EmployeeTeamDto> Teams);

public record EmployeeTeamDto(Guid Id, string Name, bool IsLead);

/// <summary>
/// Sent with every employee list so the page can show "3 / 5" and disable the access boxes it
/// has no room for, without a second round trip.
/// </summary>
public record SeatUsageDto(int Used, int Limit, int Remaining, bool HasRoom, string? LimitReason);

public record TeamListDto(IReadOnlyList<EmployeeDto> Employees, SeatUsageDto Seats);

public record SaveEmployeeRequest(
    string FirstName,
    string LastName,
    string Email,
    string? JobTitle,
    string? Phone);

/// <summary>
/// The link is returned even when the email went out, so the admin can hand it over directly
/// when a colleague says nothing arrived.
/// </summary>
/// <summary>
/// InvitationUrl is null when the person already had a Vexta account with a password: there is
/// nothing to send them, the company simply appears in their space switcher.
/// </summary>
public record AccessGrantedDto(string? InvitationUrl, DateTimeOffset? ExpiresAt, bool EmailSent, EmployeeDto Employee);

// ---- Accepting an invitation: anonymous, token in the URL ----

/// <summary>What the welcome page shows before asking for a password. No token echoed back.</summary>
public record InvitationDto(string FirstName, string LastName, string Email, string TenantName);

public record AcceptInvitationRequest(string Password);

// ---- Teams: named groups of employees ----

public record TeamMemberDto(Guid Id, string FirstName, string LastName, string? JobTitle);

public record TeamDto(
    Guid Id,
    string Name,
    string? Description,
    Guid? LeadEmployeeId,
    string? LeadName,
    IReadOnlyList<TeamMemberDto> Members,
    DateTimeOffset CreatedAt);

public record SaveTeamRequest(
    string Name,
    string? Description,
    Guid? LeadEmployeeId,
    IReadOnlyList<Guid> MemberIds);

// ---- Company locations ----

public record CompanyLocationDto(
    Guid Id,
    string Label,
    bool IsPrimary,
    string Line1,
    string? Line2,
    string City,
    string? Province,
    string PostalCode,
    string Country,
    string? Phone);

public record SaveCompanyLocationRequest(
    string Label,
    bool IsPrimary,
    string Line1,
    string? Line2,
    string City,
    string? Province,
    string PostalCode,
    string? Country,
    string? Phone);

// ---- HR documents ----

public record HrDocumentDto(
    Guid Id,
    string Title,
    string? Category,
    Guid? EmployeeId,
    string? EmployeeName,
    Guid MediaAssetId,
    string FileName,
    string ContentType,
    long SizeBytes,
    DateTimeOffset CreatedAt);

public record SaveHrDocumentRequest(
    string Title,
    string? Category,
    Guid? EmployeeId,
    Guid MediaAssetId);

/// <summary>The four counters the Ressources humaines page shows on its pills.</summary>
public record HrCountsDto(int Employees, int Teams, int Locations, int Documents);
