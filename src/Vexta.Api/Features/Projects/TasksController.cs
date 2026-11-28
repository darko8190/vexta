using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// Tasks reached by their own id, from Tâches et horaire: on a project or on none. The same rules
/// as the project's own task routes, which stay what a project's page uses.
/// </summary>
[ApiController]
[Route("api/taches")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class TasksController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>Who a task can be handed to, for a task that may be on no project.</summary>
    [HttpGet("assignables")]
    public async Task<ActionResult<TaskAssignablesDto>> Assignables(CancellationToken ct)
    {
        var employees = await db.Employees.AsNoTracking()
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName)
            .Select(e => new TaskAssigneeDto(e.Id, e.FirstName + " " + e.LastName, e.JobTitle))
            .ToListAsync(ct);
        var teams = await db.Teams.AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new TaskTeamDto(t.Id, t.Name, t.Members.Count))
            .ToListAsync(ct);
        return Ok(new TaskAssignablesDto(employees, teams));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectTaskDto>> Get(Guid id, CancellationToken ct)
    {
        var task = await LoadAsync(id, ct);
        return task is null ? NotFound() : Ok(ProjectTasksController.Map(task));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectTaskDto>> Create(SaveProjectTaskRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (request.ProjectId is { } projectId && !await db.Projects.AnyAsync(p => p.Id == projectId, ct))
            return BadRequest(new { message = "Ce projet n'existe pas." });
        if (await ProblemAsync(request, ct) is { } problem) return BadRequest(new { message = problem });

        var assignees = await ProjectTasksController.ResolveAssigneesAsync(db, request.AssigneeIds, ct);
        if (assignees is null) return BadRequest(new { message = ProjectTasksController.UnknownAssignee });

        var lastSortOrder = await db.ProjectTasks
            .Where(t => t.ProjectId == request.ProjectId)
            .MaxAsync(t => (int?)t.SortOrder, ct);

        var task = new ProjectTask
        {
            TenantId = tenantId,
            ProjectId = request.ProjectId,
            Title = request.Title.Trim(),
            Description = ProjectTasksController.Clean(request.Description),
            Priority = request.Priority,
            StartDate = request.StartDate,
            DueDate = request.DueDate,
            EstimatedHours = request.EstimatedHours,
            AssignedTeamId = request.AssignedTeamId,
            TaskTypeId = request.TaskTypeId,
            SortOrder = (lastSortOrder ?? -1) + 1
        };
        task.Assignees.AddRange(assignees);
        ProjectTasksController.ApplyCompletion(task, request.Status, currentUser.UserId);

        db.ProjectTasks.Add(task);
        if (task.ProjectId is { } onProject)
            await ProjectAutomation.AddLinesAsync(db, tenantId, onProject, AutoLineEvent.TacheCreee, task.TaskTypeId, task.Id, ct);
        await db.SaveChangesAsync(ct);
        await ProjectAutomation.MarkReadyToBillAsync(db, task.ProjectId, ct);

        return Ok(ProjectTasksController.Map(await LoadAsync(task.Id, ct) ?? task));
    }

    /// <summary>The project a task is on is kept: its hours and lines were filed against that job.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<ProjectTaskDto>> Update(Guid id, SaveProjectTaskRequest request, CancellationToken ct)
    {
        var task = await LoadAsync(id, ct);
        if (task is null) return NotFound();
        if (await ProblemAsync(request, ct) is { } problem) return BadRequest(new { message = problem });

        var assignees = await ProjectTasksController.ResolveAssigneesAsync(db, request.AssigneeIds, ct);
        if (assignees is null) return BadRequest(new { message = ProjectTasksController.UnknownAssignee });

        // A task on no project may be put on one; once on a job it stays there.
        if (task.ProjectId is null && request.ProjectId is { } projectId)
        {
            if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct))
                return BadRequest(new { message = "Ce projet n'existe pas." });
            task.ProjectId = projectId;
        }

        task.Title = request.Title.Trim();
        task.Description = ProjectTasksController.Clean(request.Description);
        task.Priority = request.Priority;
        task.StartDate = request.StartDate;
        task.DueDate = request.DueDate;
        task.EstimatedHours = request.EstimatedHours;
        task.AssignedTeamId = request.AssignedTeamId;
        task.TaskTypeId = request.TaskTypeId;
        task.UpdatedAt = DateTimeOffset.UtcNow;
        task.Assignees.Clear();
        task.Assignees.AddRange(assignees);
        ProjectTasksController.ApplyCompletion(task, request.Status, currentUser.UserId);

        await db.SaveChangesAsync(ct);
        await ProjectAutomation.MarkReadyToBillAsync(db, task.ProjectId, ct);
        return Ok(ProjectTasksController.Map(await LoadAsync(id, ct) ?? task));
    }

    [HttpPatch("{id:guid}/statut")]
    public async Task<ActionResult<ProjectTaskDto>> ChangeStatus(Guid id, ChangeTaskStatusRequest request, CancellationToken ct)
    {
        var task = await LoadAsync(id, ct);
        if (task is null) return NotFound();
        if (await ProjectTasksController.FinishProblemAsync(db, currentUser, task, request.Status, ct) is { } problem)
            return BadRequest(new { message = problem });

        ProjectTasksController.ApplyCompletion(task, request.Status, currentUser.UserId);
        task.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await ProjectAutomation.MarkReadyToBillAsync(db, task.ProjectId, ct);
        return Ok(ProjectTasksController.Map(task));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var task = await db.ProjectTasks.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (task is null) return NotFound();
        db.ProjectTasks.Remove(task);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<string?> ProblemAsync(SaveProjectTaskRequest request, CancellationToken ct)
    {
        if (ProjectTasksController.Problem(request) is { } problem) return problem;
        if (await ProjectTasksController.UnknownTeamAsync(db, request.AssignedTeamId, ct)) return ProjectTasksController.UnknownTeam;
        if (await ProjectTasksController.UnknownTypeAsync(db, request.TaskTypeId, ct)) return ProjectTasksController.UnknownType;
        return null;
    }

    private Task<ProjectTask?> LoadAsync(Guid id, CancellationToken ct) =>
        db.ProjectTasks
            .Include(t => t.Assignees)
            .Include(t => t.AssignedTeam)
            .Include(t => t.TaskType)
            .FirstOrDefaultAsync(t => t.Id == id, ct);
}
