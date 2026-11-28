using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// The hours worked on one project.
///
/// Staff only, reading included: an entry says who was on the job and for how long, which is
/// payroll's business and not the customer's, even on a project they otherwise have access to.
/// </summary>
[ApiController]
[Route("api/projects/{projectId:guid}/timesheets")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ProjectTimesheetsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<TimesheetEntryDto>>> List(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        // Newest day first, and within a day in the order the shifts were worked: that is how a
        // foreman reads back a week, and the morning shift above the evening one.
        var rows = await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.ProjectId == projectId)
            .OrderByDescending(x => x.StartDate)
            .ThenBy(x => x.StartTime)
            .Select(Fields())
            .ToListAsync(ct);

        return Ok(rows.Select(Present).ToList());
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<TimesheetEntryDto>> Create(
        Guid projectId, SaveTimesheetEntryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();
        if (await LockedAsync(projectId, ct) is { } locked) return BadRequest(new { message = locked });
        request = await OwnHoursAsync(request, ct);
        if (await ProblemAsync(request, ct) is { } problem) return BadRequest(new { message = problem });
        if (await ProjectTaskLink.ProblemAsync(db, projectId, request.ProjectTaskId, ct) is { } wrongTask)
        {
            return BadRequest(new { message = wrongTask });
        }

        var entry = new TimesheetEntry
        {
            TenantId = tenantId,
            ProjectId = projectId,
            EmployeeId = request.EmployeeId,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Hours = WorkHours.Between(request.StartDate, request.StartTime, request.EndDate, request.EndTime),
            Note = Clean(request.Note),
            ProjectTaskId = request.ProjectTaskId,
            HourlyRate = Crew ? null : request.HourlyRate
        };
        entry.HourlyRate ??= await ProjectRateAsync(projectId, ct);

        db.TimesheetEntries.Add(entry);
        await db.SaveChangesAsync(ct);

        return await GetAsync(entry.Id, ct);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TimesheetEntryDto>> Update(
        Guid projectId, Guid id, SaveTimesheetEntryRequest request, CancellationToken ct)
    {
        // Matched on the project too, not the id alone: the sheet is always opened from one
        // project, so an entry filed against another is a not-found here rather than something
        // this route will quietly rewrite.
        var entry = await db.TimesheetEntries
            .FirstOrDefaultAsync(x => x.Id == id && x.ProjectId == projectId, ct);
        if (entry is null) return NotFound();
        if (await LockedAsync(projectId, ct) is { } locked) return BadRequest(new { message = locked });

        // A line with no span of clock time — hours added by an automatic rule, or a punch too
        // short to count — whose times are left alone: its rate, note, employee and task change,
        // its stored hours stay, and nobody has to be named on it yet.
        var hoursOnly = entry.StartDate == entry.EndDate && entry.StartTime == entry.EndTime
            && request.StartDate == entry.StartDate && request.EndDate == entry.EndDate
            && request.StartTime == entry.StartTime && request.EndTime == entry.EndTime;
        if (hoursOnly)
        {
            if (request.Note is { Length: > 500 }) return BadRequest(new { message = "La note est trop longue." });
            if (request.HourlyRate is < 0 or > 100_000m) return BadRequest(new { message = "Ce taux horaire n'est pas valide." });
            if (request.EmployeeId != Guid.Empty && !await db.Employees.AnyAsync(e => e.Id == request.EmployeeId, ct))
                return BadRequest(new { message = "Cet employé n'existe pas." });
            if (await ProjectTaskLink.ProblemAsync(db, projectId, request.ProjectTaskId, ct) is { } wrong)
                return BadRequest(new { message = wrong });
            entry.EmployeeId = request.EmployeeId == Guid.Empty ? entry.EmployeeId : request.EmployeeId;
            entry.Note = Clean(request.Note);
            entry.ProjectTaskId = request.ProjectTaskId;
            if (!Crew && request.HourlyRate is { } fixedRate) entry.HourlyRate = fixedRate;
            entry.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            return await GetAsync(id, ct);
        }

        request = await OwnHoursAsync(request, ct);
        if (await ProblemAsync(request, ct) is { } problem) return BadRequest(new { message = problem });
        if (await ProjectTaskLink.ProblemAsync(db, projectId, request.ProjectTaskId, ct) is { } wrongTask)
        {
            return BadRequest(new { message = wrongTask });
        }

        entry.EmployeeId = request.EmployeeId;
        entry.StartDate = request.StartDate;
        entry.EndDate = request.EndDate;
        entry.StartTime = request.StartTime;
        entry.EndTime = request.EndTime;
        entry.Hours = WorkHours.Between(request.StartDate, request.StartTime, request.EndDate, request.EndTime);
        entry.Note = Clean(request.Note);
        entry.ProjectTaskId = request.ProjectTaskId;
        if (!Crew && request.HourlyRate is { } rate) entry.HourlyRate = rate;
        // A punch typed over by hand is closed: its four moments are now the ones on the form.
        entry.PunchState = PunchState.Aucun;
        entry.PausedAt = null;
        entry.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return await GetAsync(id, ct);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid projectId, Guid id, CancellationToken ct)
    {
        var entry = await db.TimesheetEntries
            .FirstOrDefaultAsync(x => x.Id == id && x.ProjectId == projectId, ct);
        if (entry is null) return NotFound();
        if (await LockedAsync(projectId, ct) is { } locked) return BadRequest(new { message = locked });

        db.TimesheetEntries.Remove(entry);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// One rate on every labour entry of the job, from the totals table. The office's call only:
    /// it reprices what the client is billed.
    /// </summary>
    [HttpPut("taux")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> SetRate(Guid projectId, SetLabourRateRequest request, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();
        if (await LockedAsync(projectId, ct) is { } locked) return BadRequest(new { message = locked });
        if (request.HourlyRate is < 0 or > 100_000m) return BadRequest(new { message = "Ce taux horaire n'est pas valide." });

        var rate = Math.Round(request.HourlyRate, 2);
        await db.TimesheetEntries.Where(x => x.ProjectId == projectId)
            .ExecuteUpdateAsync(set => set
                .SetProperty(x => x.HourlyRate, rate)
                .SetProperty(x => x.UpdatedAt, DateTimeOffset.UtcNow), ct);
        return NoContent();
    }

    // ---- Punch: Commencer, Pause, Continuer, Terminer ----

    /// <summary>My punch still open, on whatever job it is, or null.</summary>
    [HttpGet("punch")]
    public async Task<ActionResult<TimesheetEntryDto?>> MyPunch(Guid projectId, CancellationToken ct)
    {
        if (await MyEmployeeIdAsync(ct) is not { } me) return Ok(null);
        var row = await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.EmployeeId == me && x.PunchState != PunchState.Aucun)
            .Select(Fields())
            .FirstOrDefaultAsync(ct);
        return Ok(row is null ? null : Present(row));
    }

    [HttpPost("punch")]
    [RequireBusinessTenant]
    public async Task<ActionResult<TimesheetEntryDto>> StartPunch(Guid projectId, StartPunchRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();
        if (await LockedAsync(projectId, ct) is { } locked) return BadRequest(new { message = locked });
        if (await MyEmployeeIdAsync(ct) is not { } me)
            return BadRequest(new { message = "Votre compte n'est rattaché à aucun employé." });
        if (await ProjectTaskLink.ProblemAsync(db, projectId, request.ProjectTaskId, ct) is { } wrongTask)
            return BadRequest(new { message = wrongTask });

        var open = await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.EmployeeId == me && x.PunchState != PunchState.Aucun)
            .Select(x => (int?)x.Project!.Number)
            .FirstOrDefaultAsync(ct);
        if (open is { } number)
            return BadRequest(new { message = $"Terminez d'abord le punch en cours sur le projet P-{number:0000}." });

        var now = BusinessDay.Now;
        var date = DateOnly.FromDateTime(now.DateTime);
        var time = TimeOnly.FromDateTime(now.DateTime);
        var entry = new TimesheetEntry
        {
            TenantId = tenantId,
            ProjectId = projectId,
            ProjectTaskId = request.ProjectTaskId,
            EmployeeId = me,
            StartDate = date,
            EndDate = date,
            StartTime = time,
            EndTime = time,
            Hours = 0m,
            Note = Clean(request.Note),
            HourlyRate = await ProjectRateAsync(projectId, ct),
            PunchState = PunchState.EnCours,
            PunchStartedAt = DateTimeOffset.UtcNow
        };
        db.TimesheetEntries.Add(entry);
        await db.SaveChangesAsync(ct);
        return await GetAsync(entry.Id, ct);
    }

    [HttpPost("punch/{id:guid}/pause")]
    public Task<ActionResult<TimesheetEntryDto>> Pause(Guid projectId, Guid id, CancellationToken ct) =>
        PunchStepAsync(projectId, id, entry =>
        {
            if (entry.PunchState != PunchState.EnCours) return "Ce punch n'est pas en cours.";
            entry.PunchState = PunchState.EnPause;
            entry.PausedAt = DateTimeOffset.UtcNow;
            return null;
        }, ct);

    [HttpPost("punch/{id:guid}/continuer")]
    public Task<ActionResult<TimesheetEntryDto>> Resume(Guid projectId, Guid id, CancellationToken ct) =>
        PunchStepAsync(projectId, id, entry =>
        {
            if (entry.PunchState != PunchState.EnPause) return "Ce punch n'est pas en pause.";
            CloseCurrentPause(entry);
            entry.PunchState = PunchState.EnCours;
            return null;
        }, ct);

    [HttpPost("punch/{id:guid}/terminer")]
    public Task<ActionResult<TimesheetEntryDto>> EndPunch(Guid projectId, Guid id, EndPunchRequest request, CancellationToken ct) =>
        PunchStepAsync(projectId, id, entry =>
        {
            if (entry.PunchState == PunchState.Aucun) return "Ce punch est déjà terminé.";
            if (request.Note is { Length: > 500 }) return "La note est trop longue.";
            CloseCurrentPause(entry);

            var started = entry.PunchStartedAt ?? DateTimeOffset.UtcNow;
            var ended = DateTimeOffset.UtcNow;
            var local = BusinessDay.ToLocal(ended);
            entry.EndDate = DateOnly.FromDateTime(local.DateTime);
            entry.EndTime = TimeOnly.FromDateTime(local.DateTime);
            entry.Hours = WorkHours.FromMinutes((ended - started).TotalMinutes - entry.PausedSeconds / 60.0);
            entry.PunchState = PunchState.Aucun;
            if (Clean(request.Note) is { } note) entry.Note = note;
            return null;
        }, ct);

    /// <summary>One step of my own punch. Nobody moves somebody else's clock.</summary>
    private async Task<ActionResult<TimesheetEntryDto>> PunchStepAsync(
        Guid projectId, Guid id, Func<TimesheetEntry, string?> step, CancellationToken ct)
    {
        var me = await MyEmployeeIdAsync(ct);
        var entry = await db.TimesheetEntries.FirstOrDefaultAsync(x => x.Id == id && x.ProjectId == projectId, ct);
        if (entry is null || me is null || entry.EmployeeId != me) return NotFound();
        if (step(entry) is { } problem) return BadRequest(new { message = problem });
        entry.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    private static void CloseCurrentPause(TimesheetEntry entry)
    {
        if (entry.PausedAt is { } since)
            entry.PausedSeconds += (int)Math.Max(0, (DateTimeOffset.UtcNow - since).TotalSeconds);
        entry.PausedAt = null;
    }

    private bool Crew => currentUser.Role == UserRole.TenantUser;

    /// <summary>
    /// The rate a new line on this job starts at: the one its latest priced line carries — what
    /// the totals table last set — or the company's when the job has none yet.
    /// </summary>
    private async Task<decimal?> ProjectRateAsync(Guid projectId, CancellationToken ct) =>
        await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.ProjectId == projectId && x.HourlyRate != null)
            .OrderByDescending(x => x.UpdatedAt)
            .Select(x => x.HourlyRate)
            .FirstOrDefaultAsync(ct)
        ?? await DefaultRateAsync(ct);

    private async Task<decimal?> DefaultRateAsync(CancellationToken ct) =>
        await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == currentUser.TenantId)
            .Select(b => b.DefaultHourlyRate)
            .FirstOrDefaultAsync(ct);

    private Task<Guid?> MyEmployeeIdAsync(CancellationToken ct) =>
        db.Employees.AsNoTracking()
            .Where(e => e.UserId == currentUser.UserId)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(ct);

    private TimesheetEntryDto Present(TimesheetRow row)
    {
        var dto = ToDto(row);
        return Crew ? dto with { HourlyRate = null } : dto;
    }

    private async Task<ActionResult<TimesheetEntryDto>> GetAsync(Guid id, CancellationToken ct)
    {
        var row = await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(Fields())
            .FirstOrDefaultAsync(ct);

        return row is null ? NotFound() : Ok(Present(row));
    }

    /// <summary>
    /// An employee punches their own hours: whoever the form named, the entry is theirs. The
    /// office still files hours for anyone.
    /// </summary>
    private async Task<SaveTimesheetEntryRequest> OwnHoursAsync(SaveTimesheetEntryRequest request, CancellationToken ct)
    {
        // An employee always; anyone else when the form named nobody (the employee view).
        if (currentUser.Role != UserRole.TenantUser && request.EmployeeId != Guid.Empty) return request;
        var own = await db.Employees.AsNoTracking()
            .Where(e => e.UserId == currentUser.UserId)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(ct);
        return own is { } id ? request with { EmployeeId = id } : request;
    }

    /// <summary>
    /// Everything that can go wrong with an entry, in the order the person filling the form
    /// would meet it. The employee is checked against this tenant's own payroll — the query
    /// filter is what makes a borrowed id simply not exist here.
    /// </summary>
    private async Task<string?> ProblemAsync(SaveTimesheetEntryRequest request, CancellationToken ct)
    {
        if (request.EmployeeId == Guid.Empty) return "Choisissez un employé.";
        if (!await db.Employees.AnyAsync(e => e.Id == request.EmployeeId, ct))
        {
            return "Cet employé n'existe pas.";
        }

        if (request.Note is { Length: > 500 }) return "La note est trop longue.";
        if (request.HourlyRate is < 0 or > 100_000m) return "Ce taux horaire n'est pas valide.";

        // Zero is how WorkHours says the end is not after the start, which covers both a shift
        // typed backwards and one that lasts no time at all. Neither is an entry worth storing.
        if (WorkHours.Between(request.StartDate, request.StartTime, request.EndDate, request.EndTime) == 0m)
        {
            return "La fin du quart doit venir après son début.";
        }

        return null;
    }

    /// <summary>
    /// The refusal to hand back when the job has been billed, or null while it is open.
    ///
    /// Read from the project on every write rather than trusted from the request: this row is
    /// one of the figures the client was charged from, and the browser is not the authority on
    /// whether that invoice has gone out.
    /// </summary>
    private async Task<string?> LockedAsync(Guid projectId, CancellationToken ct)
    {
        var status = await db.Projects.Where(p => p.Id == projectId)
            .Select(p => (ProjectStatus?)p.Status)
            .FirstOrDefaultAsync(ct);

        return status is null ? null : ProjectLock.Problem(status.Value);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// The columns the sheet needs. Kept as a projection the database can run, with the name
    /// and the clock times assembled afterwards: Employee.FullName is computed in the domain
    /// rather than stored, and no provider translates ToString(@"HH:mm").
    /// </summary>
    private static System.Linq.Expressions.Expression<Func<TimesheetEntry, TimesheetRow>> Fields() =>
        x => new TimesheetRow(
            x.Id,
            x.EmployeeId,
            x.Employee == null ? null : x.Employee.FirstName,
            x.Employee == null ? null : x.Employee.LastName,
            x.StartDate,
            x.EndDate,
            x.StartTime,
            x.EndTime,
            x.Hours,
            x.Note,
            x.ProjectTaskId,
            x.ProjectTask == null ? null : x.ProjectTask.Title,
            x.CreatedAt,
            x.UpdatedAt,
            x.HourlyRate,
            x.PunchState,
            x.PunchStartedAt,
            x.PausedAt,
            x.PausedSeconds);

    private static TimesheetEntryDto ToDto(TimesheetRow row) =>
        new(row.Id,
            row.EmployeeId,
            $"{row.FirstName} {row.LastName}".Trim() is { Length: > 0 } name ? name : null,
            row.StartDate,
            row.EndDate,
            row.StartTime.ToString(@"HH\:mm"),
            row.EndTime.ToString(@"HH\:mm"),
            row.Hours,
            row.Note,
            row.ProjectTaskId,
            row.ProjectTaskTitle,
            row.CreatedAt,
            row.UpdatedAt,
            row.HourlyRate,
            row.PunchState,
            row.PunchStartedAt,
            row.PausedAt,
            row.PausedSeconds);

    private record TimesheetRow(
        Guid Id,
        Guid? EmployeeId,
        string? FirstName,
        string? LastName,
        DateOnly StartDate,
        DateOnly EndDate,
        TimeOnly StartTime,
        TimeOnly EndTime,
        decimal Hours,
        string? Note,
        Guid? ProjectTaskId,
        string? ProjectTaskTitle,
        DateTimeOffset CreatedAt,
        DateTimeOffset UpdatedAt,
        decimal? HourlyRate,
        PunchState PunchState,
        DateTimeOffset? PunchStartedAt,
        DateTimeOffset? PausedAt,
        int PausedSeconds);
}
