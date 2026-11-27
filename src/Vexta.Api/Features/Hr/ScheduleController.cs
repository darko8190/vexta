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
