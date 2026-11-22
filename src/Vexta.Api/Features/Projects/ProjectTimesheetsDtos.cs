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
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

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
    string? Note);
