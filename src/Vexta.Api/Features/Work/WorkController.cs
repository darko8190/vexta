using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Work;

/// <summary>
/// Every task in the company, and every hour filed, read across the projects instead of inside
/// one of them.
///
/// The per-project endpoints answer "what is left on this job". These answer "what is the crew
/// doing this week" — the same rows, a different question, and the only one a foreman asks on
/// a Monday morning. Read-only on purpose: a task is edited on the job it belongs to, where its
/// project, its crew and its estimate are all on screen.
/// </summary>
[ApiController]
[Route("api/travail")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class WorkController(VextaDbContext db) : ControllerBase
{
    /// <summary>
    /// A page is 200 rows, not 25. This is a list somebody scans and filters rather than
    /// pages through, and a short page would turn one reading into eight requests.
    /// </summary>
    private const int MaxRows = 200;

    /// <param name="statut">One state. Omitted means everything still open.</param>
    /// <param name="projet">One job.</param>
    /// <param name="employe">One person's tasks, whether named on them or through their crew.</param>
    [HttpGet("taches")]
    public async Task<ActionResult<List<WorkTaskDto>>> Tasks(
        [FromQuery] ProjectTaskStatus? statut,
        [FromQuery] Guid? projet,
        [FromQuery] Guid? employe,
        CancellationToken ct)
    {
        var today = BusinessDay.Today;

        var query = db.ProjectTasks.AsNoTracking().AsQueryable();

        query = statut is { } status
            ? query.Where(t => t.Status == status)
            // The default is the work that is still work. A list opening on three years of
            // finished tasks is a list nobody reads twice.
            : query.Where(t => t.Status != ProjectTaskStatus.Terminee);

        if (projet is { } projectId) query = query.Where(t => t.ProjectId == projectId);

        if (employe is { } employeeId)
        {
            query = query.Where(t =>
                t.Assignees.Any(a => a.Id == employeeId)
                || t.AssignedTeam!.Members.Any(m => m.Id == employeeId));
        }

        var items = await query
            // Overdue first, then by due date, then the undated at the end: a task with no date
            // is not urgent, and sorting it beside today's would say it was.
            .OrderBy(t => t.DueDate == null)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .Take(MaxRows)
            .Select(t => new WorkTaskDto(
                t.Id,
                t.ProjectId,
                t.Project == null ? null : (int?)t.Project.Number,
                t.Project == null ? null : t.Project.Client!.Name,
                t.Title,
                t.Status,
                t.Priority,
                t.DueDate,
                t.DueDate != null && t.Status != ProjectTaskStatus.Terminee && t.DueDate < today,
                t.AssignedTeam != null ? t.AssignedTeam.Name : null,
                t.Assignees.Select(a => a.FirstName + " " + a.LastName).ToList(),
                t.Description,
                t.StartDate,
                t.EstimatedHours,
                t.AssignedTeamId,
                t.Assignees.Select(a => a.Id).ToList(),
                t.TaskTypeId,
                t.TaskType == null ? null : t.TaskType.Name))
            .ToListAsync(ct);

        return Ok(items);
    }

    /// <param name="du">Inclusive. Omitted means the Monday of the week that is running.</param>
    /// <param name="au">Inclusive. Omitted means the Sunday of that same week.</param>
    /// <param name="employe">One person's hours.</param>
    /// <param name="projet">One job's hours.</param>
    [HttpGet("feuilles-de-temps")]
    public async Task<ActionResult<WorkTimesheetsDto>> Timesheets(
        [FromQuery] DateOnly? du,
        [FromQuery] DateOnly? au,
        [FromQuery] Guid? employe,
        [FromQuery] Guid? projet,
        CancellationToken ct)
    {
        var today = BusinessDay.Today;

        // The running week when nobody said. Decided here rather than in the browser: the week
        // a sheet belongs to is the company's week, and two places deciding where Monday falls
        // is one too many.
        var from = du ?? today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var to = au ?? from.AddDays(6);

        var query = db.TimesheetEntries.AsNoTracking()
            .Where(t => t.StartDate >= from && t.StartDate <= to);

        if (employe is { } employeeId) query = query.Where(t => t.EmployeeId == employeeId);
        if (projet is { } projectId) query = query.Where(t => t.ProjectId == projectId);

        var rows = await query
            .OrderByDescending(t => t.StartDate).ThenBy(t => t.StartTime)
            .Take(MaxRows)
            .Select(t => new WorkTimesheetDto(
                t.Id,
                t.ProjectId,
                t.Project!.Number,
                t.Project.Client!.Name,
                t.EmployeeId,
                t.Employee != null ? t.Employee.FirstName + " " + t.Employee.LastName : null,
                t.StartDate,
                t.EndDate,
                t.StartTime,
                t.EndTime,
                t.Hours,
                t.Note))
            .ToListAsync(ct);

        // The total comes from the database rather than from the rows above, which stop at 200.
        // A footer that added up a truncated page would quietly understate a busy fortnight.
        var total = await query.SumAsync(t => (decimal?)t.Hours, ct) ?? 0m;

        return Ok(new WorkTimesheetsDto(from, to, total, rows.Count, rows));
    }
}
