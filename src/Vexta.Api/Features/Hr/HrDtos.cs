using Vexta.Api.Domain;

namespace Vexta.Api.Features.Hr;

// ---- Adresses des employés ----

public record EmployeeAddressDto(
    Guid Id,
    Guid EmployeeId,
    string EmployeeName,
    string? Label,
    bool IsPrimary,
    string Line1,
    string? Line2,
    string City,
    string? Province,
    string PostalCode,
    string Country);

public record SaveEmployeeAddressRequest(
    Guid EmployeeId,
    string? Label,
    bool IsPrimary,
    string Line1,
    string? Line2,
    string City,
    string? Province,
    string PostalCode,
    string? Country);

// ---- Contacts d'urgence ----

public record EmergencyContactDto(
    Guid Id,
    Guid EmployeeId,
    string EmployeeName,
    string Name,
    string? Relationship,
    string Phone,
    string? AltPhone,
    string? Email,
    bool IsPrimary,
    string? Note);

public record SaveEmergencyContactRequest(
    Guid EmployeeId,
    string Name,
    string? Relationship,
    string Phone,
    string? AltPhone,
    string? Email,
    bool IsPrimary,
    string? Note);

// ---- Salaires ----

/// <summary>
/// One rate, and whether it is the one in force today. The flag is computed on read rather than
/// stored: "current" changes by itself when tomorrow's raise becomes today's rate.
/// </summary>
public record EmployeeWageDto(
    Guid Id,
    DateOnly EffectiveOn,
    WageKind Kind,
    decimal Amount,
    string? Note,
    bool IsCurrent);

public record SaveEmployeeWageRequest(DateOnly EffectiveOn, WageKind Kind, decimal Amount, string? Note);

// ---- Banque d'heures ----

public record HourBankEntryDto(Guid Id, DateOnly Date, decimal Hours, string Reason, DateTimeOffset CreatedAt);

/// <param name="Balance">Every movement added up. What the employee would be owed if they took it all.</param>
public record HourBankDto(decimal Balance, decimal Banked, decimal Taken, IReadOnlyList<HourBankEntryDto> Entries);

public record SaveHourBankEntryRequest(DateOnly Date, decimal Hours, string Reason);

// ---- Congés ----

public record LeaveRequestDto(
    Guid Id,
    Guid EmployeeId,
    string EmployeeName,
    LeaveKind Kind,
    DateOnly StartDate,
    DateOnly EndDate,
    decimal? Hours,
    string? Note,
    LeaveStatus Status,
    DateTimeOffset? DecidedAt,
    string? DecisionNote,
    /// <summary>Days inclusive of both ends, so a single-day leave reads 1.</summary>
    int Days,
    DateTimeOffset CreatedAt);

public record SaveLeaveRequest(
    /// <summary>Ignored when an employee files their own: that one is taken from the token.</summary>
    Guid? EmployeeId,
    LeaveKind Kind,
    DateOnly StartDate,
    DateOnly EndDate,
    decimal? Hours,
    string? Note);

public record DecideLeaveRequest(bool Approve, string? DecisionNote);

// ---- Horaire ----

public record ScheduleShiftDto(
    Guid Id,
    Guid EmployeeId,
    string EmployeeName,
    Guid? ProjectId,
    int? ProjectNumber,
    string? ProjectDescription,
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    decimal Hours,
    string? Note);

/// <param name="Start">The Monday the week runs from.</param>
public record ScheduleWeekDto(DateOnly Start, DateOnly End, decimal TotalHours, IReadOnlyList<ScheduleShiftDto> Shifts);

public record SaveScheduleShiftRequest(
    Guid? EmployeeId,
    Guid? ProjectId,
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    string? Note);

// ---- Formations et permis ----

public record EmployeeCredentialDto(
    Guid Id,
    Guid EmployeeId,
    string EmployeeName,
    CredentialKind Kind,
    string Name,
    string? Issuer,
    string? Reference,
    DateOnly? IssuedOn,
    DateOnly? ExpiresOn,
    Guid? MediaAssetId,
    string? FileName,
    string? Note,
    /// <summary>Null when it does not expire; negative once it has.</summary>
    int? DaysUntilExpiry);

public record SaveEmployeeCredentialRequest(
    Guid EmployeeId,
    CredentialKind Kind,
    string Name,
    string? Issuer,
    string? Reference,
    DateOnly? IssuedOn,
    DateOnly? ExpiresOn,
    Guid? MediaAssetId,
    string? Note);

// ---- CV ----

public record EmployeeCvEntryDto(
    Guid Id,
    CvEntryKind Kind,
    string Title,
    string? Organization,
    DateOnly? StartOn,
    DateOnly? EndOn,
    string? Description,
    int SortOrder);

public record SaveEmployeeCvEntryRequest(
    CvEntryKind Kind,
    string Title,
    string? Organization,
    DateOnly? StartOn,
    DateOnly? EndOn,
    string? Description,
    int SortOrder);

// ---- Candidats ----

public record CandidateDto(
    Guid Id,
    string FirstName,
    string LastName,
    string? Email,
    string? Phone,
    string? DesiredJobTitle,
    string? Source,
    CandidateStatus Status,
    DateOnly AppliedOn,
    Guid? ResumeMediaAssetId,
    string? ResumeFileName,
    string? Notes,
    Guid? EmployeeId,
    /// <summary>The posting they answered, and its title, when they answered one.</summary>
    Guid? JobPostingId,
    string? JobPostingTitle);

public record SaveCandidateRequest(
    string FirstName,
    string LastName,
    string? Email,
    string? Phone,
    string? DesiredJobTitle,
    string? Source,
    CandidateStatus Status,
    DateOnly? AppliedOn,
    Guid? ResumeMediaAssetId,
    string? Notes,
    Guid? JobPostingId);

// ---- Offres d'emplois ----

/// <summary>
/// A posting as the hiring table reads it: the advertisement, plus what the company keeps to
/// itself. <see cref="Applications"/> is counted from the candidates rather than stored — a
/// tally in a column is wrong the moment an application is deleted.
/// </summary>
public record JobPostingDto(
    Guid Id,
    string Title,
    string? Description,
    string? Location,
    EmploymentType EmploymentType,
    string? Compensation,
    string? ApplyTo,
    string? Notes,
    int Openings,
    JobPostingStatus Status,
    DateOnly? PostedOn,
    DateOnly? ClosesOn,
    int Applications,
    /// <summary>Whether it is on the public page. Follows the status; never set on its own.</summary>
    bool IsPublished,
    /// <summary>The form an applicant fills, when one is attached.</summary>
    Guid? FormTemplateId,
    /// <summary>Its title, so the row can name it without a second request.</summary>
    string? FormTemplateTitle,
    /// <summary>
    /// False when a form is attached but is still a draft. The posting then asks nothing, and
    /// the screen has to be able to say so rather than show a form nobody can fill.
    /// </summary>
    bool FormIsPublished,
    List<JobPostingDocumentDto> Documents,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <summary>A file hung on a posting. The URL is minted on demand, like every other asset.</summary>
public record JobPostingDocumentDto(
    Guid Id,
    Guid MediaAssetId,
    string FileName,
    string ContentType,
    long SizeBytes,
    string? Label,
    int SortOrder);

public record SaveJobPostingRequest(
    string Title,
    string? Description,
    string? Location,
    EmploymentType EmploymentType,
    string? Compensation,
    string? ApplyTo,
    string? Notes,
    int Openings,
    JobPostingStatus Status,
    DateOnly? PostedOn,
    DateOnly? ClosesOn,
    /// <summary>The form to ask applicants to fill, or null to only say where to write.</summary>
    Guid? FormTemplateId = null);

/// <summary>What to hang on a posting, and what to call it.</summary>
public record AddJobPostingDocumentRequest(Guid MediaAssetId, string? Label);

/// <summary>What the new employee record gets. The candidate keeps everything it already had.</summary>
public record HireCandidateRequest(string Email, string? JobTitle);

// ---- Les pastilles de la page ----

/// <summary>
/// The badges on the HR rail, in one call. Leaves counts only what is still waiting for an
/// answer: a number that only goes up is a number people stop reading.
/// </summary>
public record HrSectionCountsDto(
    int Employees,
    int Teams,
    int Addresses,
    int EmergencyContacts,
    int Candidates,
    int Credentials,
    int PendingLeaves,
    int Documents);

// ---- Feuilles de temps, vues du dossier ----

/// <summary>One shift this person worked, with the job it was worked on.</summary>
public record EmployeeTimesheetDto(
    Guid Id,
    Guid ProjectId,
    int ProjectNumber,
    string ClientName,
    string? ProjectDescription,
    DateOnly StartDate,
    DateOnly EndDate,
    string StartTime,
    string EndTime,
    decimal Hours,
    string? Note);

/// <summary>
/// One week of somebody's hours. The two ends come back rather than being worked out again in
/// the browser: the week a sheet is filed against is the company's week, and two places
/// deciding where Monday falls is one place too many.
/// </summary>
public record EmployeeWeekDto(
    DateOnly WeekStart,
    DateOnly WeekEnd,
    decimal TotalHours,
    IReadOnlyList<EmployeeTimesheetDto> Entries);

/// <summary>The badges on one employee's rail. Leaves counts only what is still waiting.</summary>
public record EmployeeFileCountsDto(
    int EmergencyContacts,
    int Addresses,
    int CvEntries,
    int Wages,
    int Credentials,
    int PendingLeaves,
    int HourBankEntries,
    int Documents);
