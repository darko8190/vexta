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

        return Ok(rows.Select(ToDto).ToList());
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<TimesheetEntryDto>> Create(
        Guid projectId, SaveTimesheetEntryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();
        if (await LockedAsync(projectId, ct) is { } locked) return BadRequest(new { message = locked });
        if (await ProblemAsync(request, ct) is { } problem) return BadRequest(new { message = problem });

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
            Note = Clean(request.Note)
        };

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
        if (await ProblemAsync(request, ct) is { } problem) return BadRequest(new { message = problem });

        entry.EmployeeId = request.EmployeeId;
        entry.StartDate = request.StartDate;
        entry.EndDate = request.EndDate;
        entry.StartTime = request.StartTime;
        entry.EndTime = request.EndTime;
        entry.Hours = WorkHours.Between(request.StartDate, request.StartTime, request.EndDate, request.EndTime);
        entry.Note = Clean(request.Note);
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

    private async Task<ActionResult<TimesheetEntryDto>> GetAsync(Guid id, CancellationToken ct)
    {
        var row = await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(Fields())
            .FirstOrDefaultAsync(ct);

        return row is null ? NotFound() : Ok(ToDto(row));
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
            x.CreatedAt,
            x.UpdatedAt);

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
            row.CreatedAt,
            row.UpdatedAt);

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
        DateTimeOffset CreatedAt,
        DateTimeOffset UpdatedAt);
}
