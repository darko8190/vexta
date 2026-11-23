using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Hr;

/// <summary>
/// Time off: asked for by anyone, answered by the people who run the company.
///
/// One controller for both halves, because they are the same rows. An employee reaches it
/// without a role check and only ever sees their own — the employee is taken from the token,
/// never from the query string. A manager passes <c>employe</c> and sees whoever they asked for.
/// </summary>
[ApiController]
[Route("api/conges")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class LeaveController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <param name="employe">
    /// Whose requests. Ignored for anyone who is not a manager: they get their own, whatever
    /// they ask for.
    /// </param>
    /// <param name="statut">Only requests in this state. Omitted means all of them.</param>
    [HttpGet]
    public async Task<ActionResult<List<LeaveRequestDto>>> List(
        [FromQuery] Guid? employe, [FromQuery] LeaveStatus? statut, CancellationToken ct)
    {
        var scope = await ScopeAsync(employe, ct);
        if (scope.Forbidden) return Forbid();

        var items = await db.LeaveRequests.AsNoTracking()
            .Where(l => scope.EmployeeId == null || l.EmployeeId == scope.EmployeeId)
            .Where(l => statut == null || l.Status == statut)
            // Waiting first, then by when the leave starts: the list is worked top to bottom,
            // and an answered request is history the moment it is answered.
            .OrderBy(l => l.Status == LeaveStatus.EnAttente ? 0 : 1)
            .ThenBy(l => l.StartDate)
            .Select(Projection())
            .ToListAsync(ct);

        return Ok(items);
    }

    /// <summary>
    /// Files a request. A manager may file one for somebody else; anyone else files their own,
    /// and the employee id in the body is ignored rather than refused — a browser that sends a
    /// stale one must not be able to put a holiday on another person's file.
    /// </summary>
    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<LeaveRequestDto>> Create(SaveLeaveRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var employeeId = IsManager
            ? request.EmployeeId ?? await MyEmployeeIdAsync(ct)
            : await MyEmployeeIdAsync(ct);

        if (employeeId is not { } id)
        {
            return BadRequest(new { message = "Aucune fiche d'employé n'est rattachée à ce compte." });
        }

        if (Validate(request) is { } error) return BadRequest(new { message = error });
        if (!await db.Employees.AnyAsync(e => e.Id == id, ct))
        {
            return BadRequest(new { message = "Cet employé n'existe plus." });
        }

        var leave = new LeaveRequest
        {
            TenantId = tenantId,
            EmployeeId = id,
            Kind = request.Kind,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Hours = request.Hours,
            Note = Clean(request.Note)
        };

        db.LeaveRequests.Add(leave);
        await db.SaveChangesAsync(ct);

        return Ok(await DtoAsync(leave.Id, ct));
    }

    /// <summary>
    /// Approves or refuses. Approving a BanqueHeures leave takes the hours out of the bank in
    /// the same save as the decision, so the two can never disagree about whether they were
    /// spent.
    /// </summary>
    [HttpPost("{id:guid}/decision")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<LeaveRequestDto>> Decide(Guid id, DecideLeaveRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var leave = await db.LeaveRequests.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (leave is null) return NotFound();

        if (leave.Status == LeaveStatus.Annule)
        {
            return Conflict(new { message = "Cette demande a été annulée par l'employé." });
        }

        // Answering again is allowed — a refusal reconsidered is a normal Monday — but the hour
        // bank has to follow, which is why the old movement is taken back out first.
        if (leave.HourBankEntryId is { } previous)
        {
            var old = await db.HourBankEntries.FirstOrDefaultAsync(h => h.Id == previous, ct);
            if (old is not null) db.HourBankEntries.Remove(old);
            leave.HourBankEntryId = null;
        }

        leave.Status = request.Approve ? LeaveStatus.Approuve : LeaveStatus.Refuse;
        leave.DecidedByUserId = currentUser.UserId;
        leave.DecidedAt = DateTimeOffset.UtcNow;
        leave.DecisionNote = Clean(request.DecisionNote);
        leave.UpdatedAt = DateTimeOffset.UtcNow;

        if (request.Approve && leave.Kind == LeaveKind.BanqueHeures)
        {
            var hours = leave.Hours ?? DefaultHours(leave);

            var entry = new HourBankEntry
            {
                TenantId = tenantId,
                EmployeeId = leave.EmployeeId,
                Date = leave.StartDate,
                Hours = -Math.Abs(hours),
                Reason = $"Congé approuvé du {leave.StartDate:d MMMM yyyy} au {leave.EndDate:d MMMM yyyy}",
                CreatedByUserId = currentUser.UserId
            };

            db.HourBankEntries.Add(entry);
            leave.HourBankEntryId = entry.Id;
        }

        await db.SaveChangesAsync(ct);
        return Ok(await DtoAsync(id, ct));
    }

    /// <summary>
    /// Withdraws a request. The employee may withdraw their own while it is still waiting; a
    /// manager may withdraw any, which is how an approved holiday gets called off — and that
    /// puts banked hours back.
    /// </summary>
    [HttpPost("{id:guid}/annuler")]
    public async Task<ActionResult<LeaveRequestDto>> Cancel(Guid id, CancellationToken ct)
    {
        var leave = await db.LeaveRequests.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (leave is null) return NotFound();

        if (!IsManager)
        {
            if (await MyEmployeeIdAsync(ct) != leave.EmployeeId) return Forbid();
            if (leave.Status != LeaveStatus.EnAttente)
            {
                return Conflict(new { message = "Cette demande a déjà été répondue. Parlez-en à votre employeur." });
            }
        }

        if (leave.HourBankEntryId is { } entryId)
        {
            var entry = await db.HourBankEntries.FirstOrDefaultAsync(h => h.Id == entryId, ct);
            if (entry is not null) db.HourBankEntries.Remove(entry);
            leave.HourBankEntryId = null;
        }

        leave.Status = LeaveStatus.Annule;
        leave.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(await DtoAsync(id, ct));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var leave = await db.LeaveRequests.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (leave is null) return NotFound();

        if (leave.HourBankEntryId is { } entryId)
        {
            var entry = await db.HourBankEntries.FirstOrDefaultAsync(h => h.Id == entryId, ct);
            if (entry is not null) db.HourBankEntries.Remove(entry);
        }

        db.LeaveRequests.Remove(leave);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Helpers ----

    private bool IsManager =>
        User.IsInRole(nameof(UserRole.TenantAdmin))
        || User.IsInRole(nameof(UserRole.ProjectManager))
        || User.IsInRole(nameof(UserRole.SuperAdmin));

    /// <param name="Forbidden">True when a request asked about somebody it has no business asking about.</param>
    private readonly record struct Scope(Guid? EmployeeId, bool Forbidden);

    private async Task<Scope> ScopeAsync(Guid? asked, CancellationToken ct)
    {
        if (IsManager) return new Scope(asked, false);

        // Not an error when an employee asks about somebody else — they simply get their own.
        // The alternative tells them whose file they failed to open.
        var mine = await MyEmployeeIdAsync(ct);
        return mine is null ? new Scope(null, true) : new Scope(mine, false);
    }

    private async Task<Guid?> MyEmployeeIdAsync(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return null;

        return await db.Employees.AsNoTracking()
            .Where(e => e.UserId == userId)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<LeaveRequestDto> DtoAsync(Guid id, CancellationToken ct) =>
        await db.LeaveRequests.AsNoTracking().Where(l => l.Id == id).Select(Projection()).FirstAsync(ct);

    private static System.Linq.Expressions.Expression<Func<LeaveRequest, LeaveRequestDto>> Projection() =>
        l => new LeaveRequestDto(
            l.Id,
            l.EmployeeId,
            l.Employee!.FirstName + " " + l.Employee!.LastName,
            l.Kind,
            l.StartDate,
            l.EndDate,
            l.Hours,
            l.Note,
            l.Status,
            l.DecidedAt,
            l.DecisionNote,
            l.EndDate.DayNumber - l.StartDate.DayNumber + 1,
            l.CreatedAt);

    /// <summary>
    /// Eight hours a day when nobody said otherwise. A guess, and the screen says so — but a
    /// bank that comes out at zero because the field was left blank is worse than a guess.
    /// </summary>
    private static decimal DefaultHours(LeaveRequest leave) =>
        (leave.EndDate.DayNumber - leave.StartDate.DayNumber + 1) * 8m;

    private static string? Validate(SaveLeaveRequest r)
    {
        if (r.EndDate < r.StartDate) return "La fin du congé ne peut pas précéder son début.";
        if (r.EndDate.DayNumber - r.StartDate.DayNumber > 366) return "Un congé ne peut pas durer plus d'un an.";
        if (r.Hours is { } hours && (hours <= 0 || hours > 2000m)) return "Le nombre d'heures doit être réaliste.";
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
