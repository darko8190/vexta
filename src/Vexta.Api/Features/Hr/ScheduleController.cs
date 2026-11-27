using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Hr;

/// <summary>
/// Who is expected where, week by week.
///
/// What was planned, kept apart from what happened. A timesheet is filed after the fact by the
/// person who worked; a shift is written beforehand by whoever runs the crew. Folding the two
/// into one table would mean a plan that quietly becomes a payroll record when nobody corrects it.
/// </summary>
[ApiController]
[Route("api/horaire")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ScheduleController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <param name="semaine">Any day in the week being asked for. Omitted means this one.</param>
    /// <param name="employe">One person's week. Omitted means the whole crew's.</param>
    [HttpGet]
    public async Task<ActionResult<ScheduleWeekDto>> Week(
        [FromQuery] DateOnly? semaine, [FromQuery] Guid? employe, CancellationToken ct, [FromQuery] bool moi = false)
    {
        // « Mon horaire »: the week of the person signed in.
        if (moi)
        {
            employe = await db.Employees.AsNoTracking()
                .Where(e => e.UserId == currentUser.UserId)
                .Select(e => (Guid?)e.Id)
                .FirstOrDefaultAsync(ct) ?? Guid.Empty;
        }
        var start = MondayOf(semaine ?? BusinessDay.Today);
        var end = start.AddDays(6);

        var rows = await db.ScheduleShifts.AsNoTracking()
            .Where(s => s.Date >= start && s.Date <= end)
            .Where(s => employe == null || s.EmployeeId == employe)
            .OrderBy(s => s.Date).ThenBy(s => s.StartTime)
            .Select(s => new
            {
                s.Id,
                s.EmployeeId,
                EmployeeName = s.Employee!.FirstName + " " + s.Employee!.LastName,
                s.ProjectId,
                ProjectNumber = s.Project != null ? (int?)s.Project.Number : null,
                ProjectDescription = s.Project != null ? s.Project.Description : null,
                s.Date,
                s.StartTime,
                s.EndTime,
                s.Note
            })
            .ToListAsync(ct);

        // Hours are computed from the two times rather than stored: a planned shift is not a
        // payroll record, and a stored number would be one more thing to keep in step when
        // somebody drags the end of a day.
        var shifts = rows.Select(s => new ScheduleShiftDto(
            s.Id, s.EmployeeId, s.EmployeeName, s.ProjectId, s.ProjectNumber, s.ProjectDescription,
            s.Date, s.StartTime, s.EndTime,
            WorkHours.Between(s.Date, s.StartTime, EndDateOf(s.Date, s.StartTime, s.EndTime), s.EndTime),
            s.Note)).ToList();

        return Ok(new ScheduleWeekDto(start, end, shifts.Sum(s => s.Hours), shifts));
    }

    /// <summary>
    /// Everything the calendar draws for a period: the people as rows (with no shift too), the
    /// teams to filter by, the shifts, the leaves that fall in it, and the open projects with what
    /// is planned on each.
    /// </summary>
    /// <param name="du">First day. Omitted: the Monday of this week.</param>
    /// <param name="au">Last day. Omitted: six days after the first. At most 62 days.</param>
    /// <param name="equipe">Only the members of this team.</param>
    /// <param name="employes">Only these people, comma-separated ids.</param>
    [HttpGet("planification")]
    public async Task<ActionResult<PlanningDto>> Planning(
        [FromQuery] DateOnly? du, [FromQuery] DateOnly? au, [FromQuery] Guid? equipe, [FromQuery] string? employes,
        CancellationToken ct)
    {
        var start = du ?? MondayOf(BusinessDay.Today);
        var end = au ?? start.AddDays(6);
        if (end < start) return BadRequest(new { message = "La fin de la période est avant son début." });
        if (end.DayNumber - start.DayNumber > 62) return BadRequest(new { message = "La période est trop longue : deux mois au plus." });

        var picked = (employes ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(v => Guid.TryParse(v, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .ToList();

        // Someone who does not run the crew sees their own calendar and nothing else: not the
        // others' days, not their leaves.
        if (!IsManager)
        {
            var own = await db.Employees.AsNoTracking()
                .Where(e => e.UserId == currentUser.UserId)
                .Select(e => (Guid?)e.Id)
                .FirstOrDefaultAsync(ct);
            picked = [own ?? Guid.Empty];
            equipe = null;
        }

        var teams = await db.Teams.AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new PlanningTeamDto(t.Id, t.Name))
            .ToListAsync(ct);

        var people = await db.Employees.AsNoTracking()
            .Where(e => e.IsActive)
            .Where(e => equipe == null || e.Teams.Any(t => t.Id == equipe))
            .Where(e => picked.Count == 0 || picked.Contains(e.Id))
            .OrderBy(e => e.FirstName).ThenBy(e => e.LastName)
            .Select(e => new { e.Id, e.FirstName, e.LastName, TeamIds = e.Teams.Select(t => t.Id).ToList() })
            .ToListAsync(ct);
        var employees = people
            .Select(e => new PlanningEmployeeDto(e.Id, $"{e.FirstName} {e.LastName}".Trim(), e.TeamIds))
            .ToList();
        var ids = employees.Select(e => e.Id).ToList();

        var rows = await db.ScheduleShifts.AsNoTracking()
            .Where(s => s.Date >= start && s.Date <= end && ids.Contains(s.EmployeeId))
            .OrderBy(s => s.Date).ThenBy(s => s.StartTime)
            .Select(s => new
            {
                s.Id,
                s.EmployeeId,
                EmployeeName = s.Employee!.FirstName + " " + s.Employee!.LastName,
                s.ProjectId,
                ProjectNumber = s.Project != null ? (int?)s.Project.Number : null,
                ProjectDescription = s.Project != null ? s.Project.Description : null,
                s.Date,
                s.StartTime,
                s.EndTime,
                s.Note
            })
            .ToListAsync(ct);
        var shifts = rows.Select(s => new ScheduleShiftDto(
            s.Id, s.EmployeeId, s.EmployeeName, s.ProjectId, s.ProjectNumber, s.ProjectDescription,
            s.Date, s.StartTime, s.EndTime,
            WorkHours.Between(s.Date, s.StartTime, EndDateOf(s.Date, s.StartTime, s.EndTime), s.EndTime),
            s.Note)).ToList();

        // Pending and approved only: a refused or withdrawn request takes nobody off the site.
        var leaves = await db.LeaveRequests.AsNoTracking()
            .Where(l => ids.Contains(l.EmployeeId))
            .Where(l => l.StartDate <= end && l.EndDate >= start)
            .Where(l => l.Status == LeaveStatus.EnAttente || l.Status == LeaveStatus.Approuve)
            .OrderBy(l => l.StartDate)
            .Select(l => new PlanningLeaveDto(l.Id, l.EmployeeId, l.Kind, l.StartDate, l.EndDate, l.Hours, l.Status, l.Note))
            .ToListAsync(ct);

        // Every open job, with what the period plans on it — counted over the whole crew rather
        // than the filtered rows, so a filter never makes a planned job look unplanned.
        var projects = await db.Projects.AsNoTracking()
            .Where(p => IsManager)
            .Where(p => p.Status == ProjectStatus.AFaire || p.Status == ProjectStatus.Commence)
            .OrderBy(p => p.StartDate == null).ThenBy(p => p.StartDate).ThenBy(p => p.Number)
            .Select(p => new { p.Id, p.Number, p.Description, ClientName = p.Client!.Name, p.Status, p.StartDate, p.EndDate })
            .ToListAsync(ct);
        var projectIds = projects.Select(p => p.Id).ToList();
        var planned = await db.ScheduleShifts.AsNoTracking()
            .Where(s => s.Date >= start && s.Date <= end && s.ProjectId != null && projectIds.Contains(s.ProjectId!.Value))
            .Select(s => new { ProjectId = s.ProjectId!.Value, s.Date, s.StartTime, s.EndTime, Name = s.Employee!.FirstName + " " + s.Employee!.LastName })
            .ToListAsync(ct);
        var byProject = planned.GroupBy(s => s.ProjectId).ToDictionary(g => g.Key, g => g.ToList());

        var projectRows = projects.Select(p =>
        {
            var on = byProject.GetValueOrDefault(p.Id) ?? [];
            var hours = on.Sum(s => WorkHours.Between(s.Date, s.StartTime, EndDateOf(s.Date, s.StartTime, s.EndTime), s.EndTime));
            return new PlanningProjectDto(
                p.Id, p.Number, p.Description, p.ClientName, p.Status, p.StartDate, p.EndDate, hours,
                [.. on.Select(s => s.Name.Trim()).Distinct().Order()], on.Count > 0);
        }).ToList();

        return Ok(new PlanningDto(start, end, shifts.Sum(s => s.Hours), employees, teams, shifts, leaves, projectRows));
    }

    /// <summary>
    /// Several shifts created, changed and removed in one save, all or nothing: a paste, a
    /// selection dragged to another day, a week copied onto the next.
    /// </summary>
    [HttpPost("lot")]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<ScheduleBatchResultDto>> Batch(ScheduleBatchRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var creates = request.Create ?? [];
        var updates = request.Update ?? [];
        var deletes = request.Delete ?? [];
        if (creates.Count + updates.Count + deletes.Count == 0) return BadRequest(new { message = "Rien à enregistrer." });
        if (creates.Count + updates.Count + deletes.Count > 500) return BadRequest(new { message = "Trop de quarts d'un coup : 500 au plus." });

        foreach (var shift in creates.Concat(updates.Select(u => u.Shift)))
        {
            if (await ValidateAsync(shift, ct) is { } error) return BadRequest(new { message = error });
        }

        var touched = updates.Select(u => u.Id).Concat(deletes).Distinct().ToList();
        var existing = await db.ScheduleShifts.Where(s => touched.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct);
        if (existing.Count != touched.Count) return NotFound(new { message = "Un des quarts n'existe plus. Rechargez l'horaire." });

        var created = new List<ScheduleShift>();
        foreach (var r in creates)
        {
            var shift = new ScheduleShift
            {
                TenantId = tenantId,
                EmployeeId = r.EmployeeId!.Value,
                ProjectId = r.ProjectId,
                Date = r.Date,
                StartTime = r.StartTime,
                EndTime = r.EndTime,
                Note = Clean(r.Note)
            };
            db.ScheduleShifts.Add(shift);
            created.Add(shift);
        }

        foreach (var change in updates)
        {
            var shift = existing[change.Id];
            shift.EmployeeId = change.Shift.EmployeeId!.Value;
            shift.ProjectId = change.Shift.ProjectId;
            shift.Date = change.Shift.Date;
            shift.StartTime = change.Shift.StartTime;
            shift.EndTime = change.Shift.EndTime;
            shift.Note = Clean(change.Shift.Note);
            shift.UpdatedAt = DateTimeOffset.UtcNow;
        }

        foreach (var id in deletes.Distinct()) db.ScheduleShifts.Remove(existing[id]);

        // One SaveChanges is one transaction: the paste lands whole or not at all.
        await db.SaveChangesAsync(ct);
        return Ok(new ScheduleBatchResultDto(created.Count, updates.Count, deletes.Distinct().Count(), [.. created.Select(s => s.Id)]));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<ScheduleShiftDto>> Create(SaveScheduleShiftRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (await ValidateAsync(request, ct) is { } error) return BadRequest(new { message = error });

        var shift = new ScheduleShift
        {
            TenantId = tenantId,
            EmployeeId = request.EmployeeId!.Value,
            ProjectId = request.ProjectId,
            Date = request.Date,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Note = Clean(request.Note)
        };

        db.ScheduleShifts.Add(shift);
        await db.SaveChangesAsync(ct);

        return Ok(await DtoAsync(shift.Id, ct));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<ScheduleShiftDto>> Update(Guid id, SaveScheduleShiftRequest request, CancellationToken ct)
    {
        var shift = await db.ScheduleShifts.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (shift is null) return NotFound();
        if (await ValidateAsync(request, ct) is { } error) return BadRequest(new { message = error });

        shift.EmployeeId = request.EmployeeId!.Value;
        shift.ProjectId = request.ProjectId;
        shift.Date = request.Date;
        shift.StartTime = request.StartTime;
        shift.EndTime = request.EndTime;
        shift.Note = Clean(request.Note);
        shift.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(await DtoAsync(id, ct));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var shift = await db.ScheduleShifts.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (shift is null) return NotFound();

        db.ScheduleShifts.Remove(shift);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Helpers ----

    private bool IsManager =>
        User.IsInRole(nameof(UserRole.TenantAdmin))
        || User.IsInRole(nameof(UserRole.ProjectManager))
        || User.IsInRole(nameof(UserRole.SuperAdmin));

    private async Task<ScheduleShiftDto> DtoAsync(Guid id, CancellationToken ct)
    {
        var s = await db.ScheduleShifts.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new
            {
                x.Id,
                x.EmployeeId,
                EmployeeName = x.Employee!.FirstName + " " + x.Employee!.LastName,
                x.ProjectId,
                ProjectNumber = x.Project != null ? (int?)x.Project.Number : null,
                ProjectDescription = x.Project != null ? x.Project.Description : null,
                x.Date,
                x.StartTime,
                x.EndTime,
                x.Note
            })
            .FirstAsync(ct);

        return new ScheduleShiftDto(
            s.Id, s.EmployeeId, s.EmployeeName, s.ProjectId, s.ProjectNumber, s.ProjectDescription,
            s.Date, s.StartTime, s.EndTime,
            WorkHours.Between(s.Date, s.StartTime, EndDateOf(s.Date, s.StartTime, s.EndTime), s.EndTime),
            s.Note);
    }

    /// <summary>
    /// A shift whose end time is at or before its start runs past midnight, so it ends the next
    /// day. The alternative is a night shift that counts as minus six hours.
    /// </summary>
    private static DateOnly EndDateOf(DateOnly date, TimeOnly start, TimeOnly end) =>
        end <= start ? date.AddDays(1) : date;

    /// <summary>Monday, because that is the week a Québec payroll runs on.</summary>
    private static DateOnly MondayOf(DateOnly day) =>
        day.AddDays(-(((int)day.DayOfWeek + 6) % 7));

    private async Task<string?> ValidateAsync(SaveScheduleShiftRequest r, CancellationToken ct)
    {
        if (r.EmployeeId is not { } employeeId || employeeId == Guid.Empty)
        {
            return "Choisissez qui travaille ce quart.";
        }
        if (!await db.Employees.AnyAsync(e => e.Id == employeeId, ct))
        {
            return "Cet employé n'existe plus.";
        }
        if (r.ProjectId is { } projectId && !await db.Projects.AnyAsync(p => p.Id == projectId, ct))
        {
            return "Ce projet n'existe plus.";
        }
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
