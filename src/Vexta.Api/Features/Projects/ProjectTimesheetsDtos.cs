namespace Vexta.Api.Features.Projects;

/// <summary>
/// One stretch of worked time, as the project's sheet lists it.
///
/// The clock times go out as "HH:mm" rather than as the whole ISO time: the browser puts them
/// straight into a time input, and the seconds nobody typed are noise in a value the screen
/// then has to round-trip unchanged.
/// </summary>
/// <param name="EmployeeName">
/// Null once the person has been taken off the payroll. The hours stay on the project, so the
/// screen names the gap rather than hiding the line.
/// </param>
public record TimesheetEntryDto(
    Guid Id,
    Guid? EmployeeId,
    string? EmployeeName,
    DateOnly StartDate,
    DateOnly EndDate,
    string StartTime,
    string EndTime,
    decimal Hours,
    string? Note,
    /// <summary>
    /// The task on this job it belongs to, and that task's title for the list. Both null for a
    /// line posted against the job as a whole, which is most of them.
    /// </summary>
    Guid? ProjectTaskId,
    string? ProjectTaskTitle,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    /// <summary>What an hour of it is billed at. Null to the crew, who do not see the money.</summary>
    decimal? HourlyRate = null,
    Domain.PunchState PunchState = Domain.PunchState.Aucun,
    DateTimeOffset? PunchStartedAt = null,
    DateTimeOffset? PausedAt = null,
    int PausedSeconds = 0);

/// <summary>The rate to put on every labour entry of the project.</summary>
public record SetLabourRateRequest(decimal HourlyRate);

/// <summary>Starting a punch: optionally on one task of the job.</summary>
public record StartPunchRequest(Guid? ProjectTaskId = null, string? Note = null);

/// <summary>Ending a punch, with what was done.</summary>
public record EndPunchRequest(string? Note = null);

/// <summary>
/// What the sheet sends to file or amend an entry.
///
/// There is no Hours here on purpose: the total is what the project is billed from, so the
/// server computes it from the four moments with <see cref="Common.WorkHours"/>. A total handed
/// over by a browser is a total nobody can check against anything.
/// </summary>
public record SaveTimesheetEntryRequest(
    Guid EmployeeId,
    DateOnly StartDate,
    DateOnly EndDate,
    TimeOnly StartTime,
    TimeOnly EndTime,
    string? Note,
    /// <summary>Optional: the task these hours went into.</summary>
    Guid? ProjectTaskId = null,
    /// <summary>Null takes the company's rate on a new entry and keeps the entry's own on an edit.</summary>
    decimal? HourlyRate = null);
