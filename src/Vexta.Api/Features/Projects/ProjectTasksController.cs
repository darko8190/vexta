using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// The tasks on one project.
///
/// Staff, employees included: an employee's day is this list, and a list they cannot tick off is
/// a list somebody else has to maintain for them. What an employee may not do is covered field
/// by field below — they move a task along, they do not hand it to somebody else.
///
/// Unlike materials and expenses, tasks are not locked when the job is billed. The invoice says
/// what the client owes; it does not say the punch list is finished.
/// </summary>
[ApiController]
[Route("api/projects/{projectId:guid}/taches")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ProjectTasksController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProjectTaskDto>>> List(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        var tasks = await db.ProjectTasks.AsNoTracking()
            .Include(t => t.Assignees)
            .Include(t => t.AssignedTeam)
            .Include(t => t.TaskType)
            .Where(t => t.ProjectId == projectId)
            // Open work first, then by the order someone put them in. A finished task stays on
            // the list — it is the record of what was done — but it stops being in the way.
            .OrderBy(t => t.Status == ProjectTaskStatus.Terminee)
            .ThenBy(t => t.SortOrder)
            .ThenBy(t => t.CreatedAt)
            .ToListAsync(ct);

        return Ok(tasks.Select(Map).ToList());
    }

    /// <summary>
    /// Who a task can be handed to: the staff on file and the teams. Served from here rather
    /// than from the staff list, because that one is the owner's and this is the two columns a
    /// chargé de projet needs to fill in an assignment.
    /// </summary>
    [HttpGet("assignables")]
    public async Task<ActionResult<TaskAssignablesDto>> Assignables(Guid projectId, CancellationToken ct)
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

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectTaskDto>> Create(
        Guid projectId, SaveProjectTaskRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var assignees = await ResolveAssigneesAsync(request.AssigneeIds, ct);
        if (assignees is null) return BadRequest(new { message = UnknownAssignee });
        if (await UnknownTeamAsync(request.AssignedTeamId, ct)) return BadRequest(new { message = UnknownTeam });
        if (await UnknownTypeAsync(db, request.TaskTypeId, ct)) return BadRequest(new { message = UnknownType });

        // Max + 1 rather than a count: deleting the third of four would otherwise hand its rank
        // to the next task added, and two rows sharing a rank is a list that reshuffles itself.
        var lastSortOrder = await db.ProjectTasks
            .Where(t => t.ProjectId == projectId)
            .MaxAsync(t => (int?)t.SortOrder, ct);

        var task = new ProjectTask
        {
            TenantId = tenantId,
            ProjectId = projectId,
            Title = request.Title.Trim(),
            Description = Clean(request.Description),
            Status = request.Status,
            Priority = request.Priority,
            StartDate = request.StartDate,
            DueDate = request.DueDate,
            EstimatedHours = request.EstimatedHours,
            AssignedTeamId = request.AssignedTeamId,
            TaskTypeId = request.TaskTypeId,
            SortOrder = (lastSortOrder ?? -1) + 1
        };

        task.Assignees.AddRange(assignees);
        ApplyCompletion(task, request.Status, currentUser.UserId);

        db.ProjectTasks.Add(task);
        await ProjectAutomation.AddLinesAsync(db, tenantId, projectId, AutoLineEvent.TacheCreee, task.TaskTypeId, task.Id, ct);
        await db.SaveChangesAsync(ct);
        await ProjectAutomation.MarkReadyToBillAsync(db, projectId, ct);

        // Re-read so the team's name comes back with it: the row holds an id, and the list the
        // form is about to refresh shows a name.
        return Ok(Map(await LoadAsync(projectId, task.Id, ct) ?? task));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<ProjectTaskDto>> Update(
        Guid projectId, Guid id, SaveProjectTaskRequest request, CancellationToken ct)
    {
        // Matched on the project too, not on the id alone: a task filed against another job is
        // a not-found here rather than something this route will quietly rewrite.
        var task = await LoadAsync(projectId, id, ct);
        if (task is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var assignees = await ResolveAssigneesAsync(request.AssigneeIds, ct);
        if (assignees is null) return BadRequest(new { message = UnknownAssignee });
        if (await UnknownTeamAsync(request.AssignedTeamId, ct)) return BadRequest(new { message = UnknownTeam });
        if (await UnknownTypeAsync(db, request.TaskTypeId, ct)) return BadRequest(new { message = UnknownType });

        task.Title = request.Title.Trim();
        task.Description = Clean(request.Description);
        task.Priority = request.Priority;
        task.StartDate = request.StartDate;
        task.DueDate = request.DueDate;
        task.EstimatedHours = request.EstimatedHours;
        task.AssignedTeamId = request.AssignedTeamId;
        task.TaskTypeId = request.TaskTypeId;
        task.UpdatedAt = DateTimeOffset.UtcNow;

        task.Assignees.Clear();
        task.Assignees.AddRange(assignees);

        ApplyCompletion(task, request.Status, currentUser.UserId);

        await db.SaveChangesAsync(ct);
        await ProjectAutomation.MarkReadyToBillAsync(db, projectId, ct);
        return Ok(Map(await LoadAsync(projectId, id, ct) ?? task));
    }

    /// <summary>
    /// Moving a task along, which is the one thing an employee may do to one. Everything else —
    /// the title, the dates, who it belongs to — stays with whoever runs the job.
    /// </summary>
    [HttpPatch("{id:guid}/statut")]
    public async Task<ActionResult<ProjectTaskDto>> ChangeStatus(
        Guid projectId, Guid id, ChangeTaskStatusRequest request, CancellationToken ct)
    {
        var task = await LoadAsync(projectId, id, ct);
        if (task is null) return NotFound();
        if (await FinishProblemAsync(db, currentUser, task, request.Status, ct) is { } problem)
            return BadRequest(new { message = problem });

        ApplyCompletion(task, request.Status, currentUser.UserId);
        task.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        await ProjectAutomation.MarkReadyToBillAsync(db, projectId, ct);
        return Ok(Map(task));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid projectId, Guid id, CancellationToken ct)
    {
        var task = await db.ProjectTasks
            .FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId, ct);
        if (task is null) return NotFound();

        // The ranks of the rows below are left alone: they are only an order, and renumbering
        // the list to close a gap is work whose result nobody can see.
        db.ProjectTasks.Remove(task);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    internal const string UnknownAssignee = "Un des employés choisis n'existe pas.";
    internal const string UnknownTeam = "Cette équipe n'existe pas.";
    internal const string UnknownType = "Ce type de tâche n'existe pas.";

    private Task<ProjectTask?> LoadAsync(Guid projectId, Guid id, CancellationToken ct) =>
        db.ProjectTasks
            .Include(t => t.Assignees)
            .Include(t => t.AssignedTeam)
            .Include(t => t.TaskType)
            .FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId, ct);

    internal static async Task<bool> UnknownTypeAsync(VextaDbContext db, Guid? typeId, CancellationToken ct) =>
        typeId is { } id && !await db.TaskTypes.AnyAsync(t => t.Id == id, ct);

    /// <summary>
    /// An employee ends a task on a project only once they have hours on it: at least one entry,
    /// typed or punched and closed. The office closes tasks as it likes, and a task on no
    /// project, where no hours are kept, is ended by anyone.
    /// </summary>
    internal static async Task<string?> FinishProblemAsync(
        VextaDbContext db, ICurrentUserService currentUser, ProjectTask task, ProjectTaskStatus status, CancellationToken ct)
    {
        if (status != ProjectTaskStatus.Terminee || task.Status == ProjectTaskStatus.Terminee) return null;
        if (currentUser.Role != UserRole.TenantUser || task.ProjectId is null) return null;

        var employeeId = await db.Employees.AsNoTracking()
            .Where(e => e.UserId == currentUser.UserId)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(ct);
        var hasHours = employeeId is { } me && await db.TimesheetEntries.AnyAsync(
            x => x.ProjectTaskId == task.Id && x.EmployeeId == me && x.PunchState == PunchState.Aucun, ct);
        return hasHours ? null : "Entrez au moins une feuille de temps sur cette tâche avant de la terminer.";
    }

    /// <summary>
    /// The employees behind those ids, or null when one of them is not this company's. Null
    /// rather than a silently shorter list: a task assigned to two people out of the three that
    /// were picked is worse than a refusal.
    /// </summary>
    private Task<List<Employee>?> ResolveAssigneesAsync(IReadOnlyList<Guid>? ids, CancellationToken ct) =>
        ResolveAssigneesAsync(db, ids, ct);

    internal static async Task<List<Employee>?> ResolveAssigneesAsync(
        VextaDbContext db, IReadOnlyList<Guid>? ids, CancellationToken ct)
    {
        if (ids is null || ids.Count == 0) return [];

        var wanted = ids.Distinct().ToList();
        var found = await db.Employees.Where(e => wanted.Contains(e.Id)).ToListAsync(ct);
        return found.Count == wanted.Count ? found : null;
    }

    private Task<bool> UnknownTeamAsync(Guid? teamId, CancellationToken ct) => UnknownTeamAsync(db, teamId, ct);

    internal static async Task<bool> UnknownTeamAsync(VextaDbContext db, Guid? teamId, CancellationToken ct) =>
        teamId is { } id && !await db.Teams.AnyAsync(t => t.Id == id, ct);

    /// <summary>
    /// Sets the status and keeps the two completion columns honest: finishing stamps who and
    /// when, reopening clears both. Left to the form, a reopened task would keep the date it was
    /// once closed on and every report counting finished work would be wrong.
    /// </summary>
    internal static void ApplyCompletion(ProjectTask task, ProjectTaskStatus status, Guid? userId)
    {
        var wasDone = task.Status == ProjectTaskStatus.Terminee;
        task.Status = status;

        if (status == ProjectTaskStatus.Terminee)
        {
            if (!wasDone)
            {
                task.CompletedAt = DateTimeOffset.UtcNow;
                task.CompletedByUserId = userId;
            }

            return;
        }

        task.CompletedAt = null;
        task.CompletedByUserId = null;
    }

    internal static ProjectTaskDto Map(ProjectTask t) =>
        new(
            t.Id,
            t.Title,
            t.Description,
            t.Status,
            t.Priority,
            t.StartDate,
            t.DueDate,
            t.EstimatedHours,
            t.AssignedTeamId,
            t.AssignedTeam?.Name,
            t.Assignees
                .OrderBy(a => a.LastName).ThenBy(a => a.FirstName)
                .Select(a => new TaskAssigneeDto(a.Id, a.FullName, a.JobTitle))
                .ToList(),
            t.CompletedAt,
            // The company's own day, not the container's: in UTC a task due today reads
            // as late from 19 h every evening. See Common.BusinessDay.
            t.IsLate(BusinessDay.Today),
            t.SortOrder,
            t.TaskTypeId,
            t.TaskType?.Name,
            t.ProjectId);

    internal static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    internal static string? Problem(SaveProjectTaskRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Title)) return "Le titre est obligatoire.";
        if (r.Title.Trim().Length > 200) return "Le titre ne peut pas dépasser 200 caractères.";
        if (r.Description?.Trim().Length > 2000) return "La description est trop longue.";
        if (r.EstimatedHours is < 0) return "Les heures estimées ne peuvent pas être négatives.";
        if (r.EstimatedHours is > 9999) return "Les heures estimées sont trop élevées.";

        // Not a warning: a task that ends before it starts is a typo, and storing it would put
        // a task on the list as late from the day it was created.
        if (r.StartDate is { } start && r.DueDate is { } due && due < start)
        {
            return "L'échéance ne peut pas précéder la date de début.";
        }

        if (r.AssigneeIds is { Count: > 20 }) return "Vingt employés au maximum sur une tâche.";

        return null;
    }
}
