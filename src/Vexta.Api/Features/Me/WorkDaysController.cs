using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Me;

/// <param name="Hours">From start to end (or to now while under way), less the breaks.</param>
public record WorkDayDto(
    Guid Id, Guid EmployeeId, string EmployeeName, DateOnly Date,
    DateTimeOffset StartedAt, DateTimeOffset? EndedAt, int BreakMinutes, string? Note, decimal Hours,
    /// <summary>Hours put on projects that day (the poinçons), to compare with the day.</summary>
    decimal ProjectHours);

/// <summary>Where the signed-in employee stands today.</summary>
public record MyDayDto(bool HasEmployee, WorkDayDto? Today);

public record EndWorkDayRequest(int? BreakMinutes, string? Note);

public record SaveWorkDayRequest(DateTimeOffset StartedAt, DateTimeOffset? EndedAt, int BreakMinutes, string? Note);

/// <summary>
/// The feuilles de temps de jour: each employee's day, started and ended by the employee, read
/// by the office. The poinçons — hours on projects — are TimesheetEntry, elsewhere.
/// </summary>
[ApiController]
[Route("api/journees")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class WorkDaysController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet("moi/aujourdhui")]
    public async Task<ActionResult<MyDayDto>> Today(CancellationToken ct)
    {
        if (await MyEmployeeAsync(ct) is not { } employee) return Ok(new MyDayDto(false, null));
        var today = BusinessDay.Today;
        var day = await Days().Where(d => d.EmployeeId == employee.Id && d.Date == today).FirstOrDefaultAsync(ct);
        return Ok(new MyDayDto(true, day is null ? null : await ToDtoAsync(day, ct)));
    }

    /// <summary>Starts today. Starting a day already started answers with that day.</summary>
    [HttpPost("moi/commencer")]
    public async Task<ActionResult<MyDayDto>> Start(CancellationToken ct)
    {
        if (await MyEmployeeAsync(ct) is not { } employee)
            return BadRequest(new { message = "Votre compte n'est lié à aucune fiche d'employé dans cette entreprise." });

        var today = BusinessDay.Today;
        var day = await db.WorkDays.FirstOrDefaultAsync(d => d.EmployeeId == employee.Id && d.Date == today, ct);
        if (day is null)
        {
            day = new WorkDay { TenantId = employee.TenantId, EmployeeId = employee.Id, Date = today, StartedAt = DateTimeOffset.UtcNow };
            db.WorkDays.Add(day);
        }
        else if (day.EndedAt is not null)
        {
            // Back after ending: the day reopens rather than becoming a second one.
            day.EndedAt = null;
            day.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return await Today(ct);
    }

    [HttpPost("moi/terminer")]
    public async Task<ActionResult<MyDayDto>> End(EndWorkDayRequest request, CancellationToken ct)
    {
        if (await MyEmployeeAsync(ct) is not { } employee) return BadRequest(new { message = "Aucune fiche d'employé." });
        if (request.BreakMinutes is < 0 or > 600) return BadRequest(new { message = "La pause doit être entre 0 et 600 minutes." });

        var today = BusinessDay.Today;
        var day = await db.WorkDays.FirstOrDefaultAsync(d => d.EmployeeId == employee.Id && d.Date == today, ct);
        if (day is null) return BadRequest(new { message = "Votre journée n'est pas commencée." });

        day.EndedAt = DateTimeOffset.UtcNow;
        if (request.BreakMinutes is { } pause) day.BreakMinutes = pause;
        if (request.Note is not null) day.Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        day.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return await Today(ct);
    }

    /// <summary>My own days, for « Mes feuilles de temps ».</summary>
    [HttpGet("moi")]
    public async Task<ActionResult<List<WorkDayDto>>> Mine([FromQuery] DateOnly? du, [FromQuery] DateOnly? au, CancellationToken ct)
    {
        if (await MyEmployeeAsync(ct) is not { } employee) return Ok(new List<WorkDayDto>());
        return Ok(await ListAsync(Days().Where(d => d.EmployeeId == employee.Id), du, au, ct));
    }

    /// <summary>Everybody's days, for the office.</summary>
    [HttpGet]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<List<WorkDayDto>>> All(
        [FromQuery] DateOnly? du, [FromQuery] DateOnly? au, [FromQuery] Guid? employe, CancellationToken ct)
    {
        var query = Days();
        if (employe is { } employeeId) query = query.Where(d => d.EmployeeId == employeeId);
        return Ok(await ListAsync(query, du, au, ct));
    }

    /// <summary>The office corrects a day: a forgotten end, a wrong break.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<WorkDayDto>> Update(Guid id, SaveWorkDayRequest request, CancellationToken ct)
    {
        var day = await db.WorkDays.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (day is null) return NotFound();
        if (request.EndedAt is { } end && end < request.StartedAt) return BadRequest(new { message = "La fin est avant le début." });
        if (request.BreakMinutes is < 0 or > 600) return BadRequest(new { message = "La pause doit être entre 0 et 600 minutes." });

        day.StartedAt = request.StartedAt;
        day.EndedAt = request.EndedAt;
        day.BreakMinutes = request.BreakMinutes;
        day.Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        day.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(await ToDtoAsync(await Days().FirstAsync(d => d.Id == id, ct), ct));
    }

    private IQueryable<WorkDay> Days() => db.WorkDays.AsNoTracking().Include(d => d.Employee);

    private async Task<List<WorkDayDto>> ListAsync(IQueryable<WorkDay> query, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var end = to ?? BusinessDay.Today;
        var start = from ?? end.AddDays(-13);
        var days = await query.Where(d => d.Date >= start && d.Date <= end)
            .OrderByDescending(d => d.Date).ThenBy(d => d.Employee!.LastName).ToListAsync(ct);

        var employeeIds = days.Select(d => d.EmployeeId).Distinct().ToList();
        var punches = await db.TimesheetEntries.AsNoTracking()
            .Where(t => t.EmployeeId != null && employeeIds.Contains(t.EmployeeId.Value) && t.StartDate >= start && t.StartDate <= end)
            .GroupBy(t => new { t.EmployeeId, t.StartDate })
            .Select(g => new { g.Key.EmployeeId, g.Key.StartDate, Hours = g.Sum(t => t.Hours) })
            .ToListAsync(ct);

        return days.Select(d => Map(d,
            punches.Where(p => p.EmployeeId == d.EmployeeId && p.StartDate == d.Date).Sum(p => p.Hours))).ToList();
    }

    private async Task<WorkDayDto> ToDtoAsync(WorkDay day, CancellationToken ct)
    {
        var projectHours = await db.TimesheetEntries.AsNoTracking()
            .Where(t => t.EmployeeId == day.EmployeeId && t.StartDate == day.Date)
            .SumAsync(t => (decimal?)t.Hours, ct) ?? 0m;
        return Map(day, projectHours);
    }

    private static WorkDayDto Map(WorkDay d, decimal projectHours)
    {
        var until = d.EndedAt ?? DateTimeOffset.UtcNow;
        var minutes = Math.Max(0, (until - d.StartedAt).TotalMinutes - d.BreakMinutes);
        return new WorkDayDto(
            d.Id, d.EmployeeId, d.Employee?.FullName ?? "", d.Date, d.StartedAt, d.EndedAt, d.BreakMinutes, d.Note,
            Math.Round((decimal)minutes / 60m, 2), projectHours);
    }

    private async Task<Employee?> MyEmployeeAsync(CancellationToken ct) =>
        currentUser.UserId is { } userId
            ? await db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.UserId == userId, ct)
            : null;
}
