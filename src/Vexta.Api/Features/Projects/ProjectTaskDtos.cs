using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>One person a task can be, or is, handed to.</summary>
public record TaskAssigneeDto(Guid Id, string Name, string? JobTitle);

/// <summary>One crew. The head count is shown so "Toiture (4)" means something in a list.</summary>
public record TaskTeamDto(Guid Id, string Name, int MemberCount);

public record TaskAssignablesDto(
    IReadOnlyList<TaskAssigneeDto> Employees,
    IReadOnlyList<TaskTeamDto> Teams);

public record ProjectTaskDto(
    Guid Id,
    string Title,
    string? Description,
    ProjectTaskStatus Status,
    ProjectTaskPriority Priority,
    DateOnly? StartDate,
    DateOnly? DueDate,
    decimal? EstimatedHours,
    Guid? AssignedTeamId,
    /// <summary>The crew's name, so the list needs no second request to be readable.</summary>
    string? AssignedTeamName,
    IReadOnlyList<TaskAssigneeDto> Assignees,
    DateTimeOffset? CompletedAt,
    /// <summary>Computed here rather than in the browser, so every reader agrees on today.</summary>
    bool IsLate,
    int SortOrder);

public record SaveProjectTaskRequest(
    string Title,
    string? Description,
    ProjectTaskStatus Status = ProjectTaskStatus.AFaire,
    ProjectTaskPriority Priority = ProjectTaskPriority.Normale,
    DateOnly? StartDate = null,
    DateOnly? DueDate = null,
    decimal? EstimatedHours = null,
    /// <summary>A crew, named people, both, or neither — all four are real states.</summary>
    Guid? AssignedTeamId = null,
    IReadOnlyList<Guid>? AssigneeIds = null);

/// <summary>Moving a task along, which is all an employee may do to one.</summary>
public record ChangeTaskStatusRequest(ProjectTaskStatus Status);
