using Vexta.Api.Domain;

namespace Vexta.Api.Features.Me;

/// <summary>One shift of mine, with the job it was worked on.</summary>
public record MyTimesheetDto(
    Guid Id,
    Guid ProjectId,
    /// <summary>Shown as P-0001, which is how the job is named on paper.</summary>
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
/// My week: which week it is, what I put on it, and the total.
///
/// The two ends of the week come back rather than being worked out again in the browser. The
/// week a sheet is filed against is the company's week, and two places deciding where Monday
/// falls is one place too many.
/// </summary>
public record MyWeekDto(
    DateOnly WeekStart,
    DateOnly WeekEnd,
    decimal TotalHours,
    /// <summary>
    /// False when this account has no employee record behind it — a founder who never put
    /// themselves on the payroll. Not an error: the page says so and offers the way out.
    /// </summary>
    bool HasEmployeeRecord,
    IReadOnlyList<MyTimesheetDto> Entries);

/// <summary>
/// A task handed to me, with how it reached me.
///
/// <paramref name="ViaTeam"/> is the crew's name when the task went to the crew rather than to
/// me by name. Worth saying: "ce n'est pas à moi, c'est à l'équipe" is the first thing anybody
/// thinks when they see a task they do not recognise, and the answer is either yes or no.
/// </summary>
public record MyAssignmentDto(
    Guid Id,
    /// <summary>The three are null for a task that belongs to no project.</summary>
    Guid? ProjectId,
    int? ProjectNumber,
    string? ClientName,
    string Title,
    string? Description,
    ProjectTaskStatus Status,
    ProjectTaskPriority Priority,
    DateOnly? StartDate,
    DateOnly? DueDate,
    bool IsLate,
    string? ViaTeam,
    /// <summary>
    /// How many closed entries I filed on this task. The task can be ended from my list once
    /// there is at least one — or at once when it is on no project, where no hours are kept.
    /// </summary>
    int MyEntries = 0);

public record MyAssignmentsDto(bool HasEmployeeRecord, IReadOnlyList<MyAssignmentDto> Assignments);
