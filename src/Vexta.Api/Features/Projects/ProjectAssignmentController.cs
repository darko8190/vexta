using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>A job nobody has been handed yet, as the « Projets à assigner » list shows it.</summary>
public record ProjectToAssignDto(
    Guid Id, int Number, string ClientName, string? Description, ProjectStatus Status,
    DateOnly? StartDate, string? PriorityName, int OpenTasks);

/// <summary>Who the job goes to: a crew, named people, or both.</summary>
public record AssignProjectRequest(Guid? TeamId, IReadOnlyList<Guid>? EmployeeIds);

/// <summary>
/// The projects waiting for a crew: À faire or Commencé, with no open task handed to anyone —
/// a project with no task at all included. Assigning one hands every open, unassigned task to
/// the people chosen, or creates the task « Travaux » for them when there is none.
/// </summary>
[ApiController]
[Route("api/projects")]
[StaffOnly]
[Authorize(Roles = Roles.Managers)]
[RequireActiveSubscription]
public class ProjectAssignmentController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet("a-assigner")]
    public async Task<ActionResult<List<ProjectToAssignDto>>> ToAssign(CancellationToken ct)
    {
        var rows = await db.Projects.AsNoTracking()
            .Where(p => p.Status == ProjectStatus.AFaire || p.Status == ProjectStatus.Commence)
            .Where(p => !p.Tasks.Any(t => t.Status != ProjectTaskStatus.Terminee
                && (t.AssignedTeamId != null || t.Assignees.Any())))
            .OrderBy(p => p.StartDate == null)
            .ThenBy(p => p.StartDate)
            .ThenBy(p => p.Number)
            .Select(p => new ProjectToAssignDto(
                p.Id, p.Number, p.Client!.Name, p.Description, p.Status, p.StartDate,
                p.Priority == null ? null : p.Priority.Name,
                p.Tasks.Count(t => t.Status != ProjectTaskStatus.Terminee)))
            .Take(200)
            .ToListAsync(ct);
        return Ok(rows);
    }

    [HttpPost("{id:guid}/assigner")]
    public async Task<IActionResult> Assign(Guid id, AssignProjectRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (project is null) return NotFound();
        if (request.TeamId is null && (request.EmployeeIds is null || request.EmployeeIds.Count == 0))
            return BadRequest(new { message = "Choisissez une équipe ou au moins un employé." });
        if (await ProjectTasksController.UnknownTeamAsync(db, request.TeamId, ct))
            return BadRequest(new { message = ProjectTasksController.UnknownTeam });
        var employees = await ProjectTasksController.ResolveAssigneesAsync(db, request.EmployeeIds, ct);
        if (employees is null) return BadRequest(new { message = ProjectTasksController.UnknownAssignee });

        var open = await db.ProjectTasks
            .Include(t => t.Assignees)
            .Where(t => t.ProjectId == id && t.Status != ProjectTaskStatus.Terminee)
            .ToListAsync(ct);
        var unassigned = open.Where(t => t.AssignedTeamId == null && t.Assignees.Count == 0).ToList();

        if (open.Count == 0)
        {
            var title = project.Description?.Split('\n')[0].Trim() is { Length: > 0 } first
                ? (first.Length > 200 ? first[..200] : first)
                : "Travaux";
            var task = new ProjectTask
            {
                TenantId = tenantId,
                ProjectId = id,
                Title = title,
                StartDate = project.StartDate,
                DueDate = project.EndDate,
                SortOrder = 0
            };
            db.ProjectTasks.Add(task);
            unassigned.Add(task);
        }

        foreach (var task in unassigned)
        {
            task.AssignedTeamId = request.TeamId;
            task.Assignees.Clear();
            task.Assignees.AddRange(employees);
            task.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
