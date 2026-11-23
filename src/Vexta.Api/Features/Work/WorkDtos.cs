using Vexta.Api.Domain;

namespace Vexta.Api.Features.Work;

/// <summary>
/// A task as the company-wide list reads it: which job it is on, and who has it. Lighter than
/// the per-project record — no description, no estimate — because this list is scanned, and the
/// row links to the job where the whole task lives.
/// </summary>
public record WorkTaskDto(
    Guid Id,
    Guid ProjectId,
    int ProjectNumber,
    string ClientName,
    string Title,
    ProjectTaskStatus Status,
    ProjectTaskPriority Priority,
    DateOnly? DueDate,
    /// <summary>Computed on the server, so every reader agrees on what day it is.</summary>
    bool IsLate,
    string? AssignedTeamName,
    List<string> AssigneeNames);

/// <summary>
/// One stretch of time, with the job and the person it belongs to spelled out: this list crosses
/// every project, so a row that only carried ids would be unreadable.
/// </summary>
public record WorkTimesheetDto(
    Guid Id,
    Guid ProjectId,
    int ProjectNumber,
    string ClientName,
    Guid? EmployeeId,
    /// <summary>Null when the employee has since been removed. The hours stay.</summary>
    string? EmployeeName,
    DateOnly StartDate,
    DateOnly EndDate,
    TimeOnly StartTime,
    TimeOnly EndTime,
    decimal Hours,
    string? Note);

/// <summary>
/// The period the server decided on, the hours in it, and the rows. <see cref="TotalHours"/>
/// covers the whole period even when <see cref="Rows"/> was cut short, and
/// <see cref="ShownCount"/> is what came back — the page says so rather than letting a footer
/// disagree with the table above it.
/// </summary>
public record WorkTimesheetsDto(
    DateOnly From,
    DateOnly To,
    decimal TotalHours,
    int ShownCount,
    List<WorkTimesheetDto> Rows);
