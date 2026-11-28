using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Me;

/// <summary>
/// What the signed-in employee has to do and what they have done: their own hours, week by
/// week, and the tasks handed to them.
///
/// Its own controller rather than a filter on the company-wide lists, because the question is a
/// different one. "Les heures du chantier" is read by whoever runs the job; "mes heures" is read
/// by the person who worked them, who wants one week across every job and no one else's rows.
/// Nothing here can be made to answer about somebody else: the employee is taken from the
/// token, never from a parameter.
/// </summary>
[ApiController]
[Route("api/moi")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class MyWorkController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <param name="semaine">
    /// Any day in the week being asked for. The week it falls in is returned, Monday to Sunday.
    /// Omitted means this week, which is what somebody opening the page on a Friday afternoon
    /// is after.
    /// </param>
    [HttpGet("heures")]
    public async Task<ActionResult<MyWeekDto>> Week([FromQuery] DateOnly? semaine, CancellationToken ct)
    {
        var anchor = semaine ?? BusinessDay.Today;
        var start = MondayOf(anchor);
        var end = start.AddDays(6);

        if (await MyEmployeeIdAsync(ct) is not { } employeeId)
        {
            return Ok(new MyWeekDto(start, end, 0m, false, []));
        }

        // Overlapping, not starting inside: a shift that begins Sunday at 22 h and ends Monday
        // at 2 h belongs to both weeks, and dropping it from one of them loses paid hours.
        var rows = await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.EmployeeId == employeeId && x.StartDate <= end && x.EndDate >= start)
            .OrderBy(x => x.StartDate).ThenBy(x => x.StartTime)
            .Select(x => new
            {
                x.Id,
                x.ProjectId,
                ProjectNumber = x.Project!.Number,
                ClientName = x.Project!.Client!.Name,
                ProjectDescription = x.Project!.Description,
                x.StartDate,
                x.EndDate,
                x.StartTime,
                x.EndTime,
                x.Hours,
                x.Note
            })
            .ToListAsync(ct);

        var entries = rows.Select(x => new MyTimesheetDto(
            x.Id,
            x.ProjectId,
            x.ProjectNumber,
            x.ClientName,
            x.ProjectDescription,
            x.StartDate,
            x.EndDate,
            x.StartTime.ToString(@"HH\:mm"),
            x.EndTime.ToString(@"HH\:mm"),
            x.Hours,
            x.Note)).ToList();

        return Ok(new MyWeekDto(start, end, entries.Sum(e => e.Hours), true, entries));
    }

    [HttpGet("assignations")]
    public async Task<ActionResult<MyAssignmentsDto>> Assignments(CancellationToken ct)
    {
        if (await MyEmployeeIdAsync(ct) is not { } employeeId)
        {
            return Ok(new MyAssignmentsDto(false, []));
        }

        var today = BusinessDay.Today;

        // By name or through a crew, in one query: somebody in two crews with a task of their
        // own must see it once, and Any() on both sides is what makes the row appear once.
        var rows = await db.ProjectTasks.AsNoTracking()
            .Where(t => t.Assignees.Any(a => a.Id == employeeId)
                || (t.AssignedTeamId != null && t.AssignedTeam!.Members.Any(m => m.Id == employeeId)))
            .Select(t => new
            {
                t.Id,
                t.ProjectId,
                ProjectNumber = t.Project == null ? null : (int?)t.Project.Number,
                ClientName = t.Project == null ? null : t.Project.Client!.Name,
                MyEntries = db.TimesheetEntries.Count(x => x.ProjectTaskId == t.Id && x.EmployeeId == employeeId
                    && x.PunchState == PunchState.Aucun),
                t.Title,
                t.Description,
                t.Status,
                t.Priority,
                t.StartDate,
                t.DueDate,
                // Null when it was handed to me by name, so the list only mentions a crew when
                // the crew is the reason the task is on my screen.
                ViaTeam = t.Assignees.Any(a => a.Id == employeeId) ? null : t.AssignedTeam!.Name
            })
            .ToListAsync(ct);

        // Still to do first, then by what is most pressing, then by the date it is wanted.
        // Finished work stays on the list for the day it is read — somebody who ticked three
        // things off this morning should still see them there.
        var assignments = rows
            .OrderBy(t => t.Status == ProjectTaskStatus.Terminee)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.DueDate ?? DateOnly.MaxValue)
            .Select(t => new MyAssignmentDto(
                t.Id,
                t.ProjectId,
                t.ProjectNumber,
                t.ClientName,
                t.Title,
                t.Description,
                t.Status,
                t.Priority,
                t.StartDate,
                t.DueDate,
                t.Status != ProjectTaskStatus.Terminee && t.DueDate is { } due && due < today,
                t.ViaTeam,
                t.MyEntries))
            .ToList();

        return Ok(new MyAssignmentsDto(true, assignments));
    }

    /// <summary>
    /// The employee record behind the signed-in account, or null when there is none. A founder
    /// who never put themselves on the payroll is in that position, and it is not a failure —
    /// they simply have no hours and no tasks of their own.
    /// </summary>
    private async Task<Guid?> MyEmployeeIdAsync(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return null;

        return await db.Employees.AsNoTracking()
            .Where(e => e.UserId == userId)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// The Monday of the week a date falls in. Monday because that is the week a Québec payroll
    /// runs on, and because a week that starts on Sunday splits every crew's weekend shift.
    /// </summary>
    private static DateOnly MondayOf(DateOnly date) =>
        date.AddDays(-((int)date.DayOfWeek + 6) % 7);
}
