using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Hr;

/// <summary>
/// What someone is paid, and what the company owes them in time.
///
/// Behind the owner's role rather than a manager's: a foreman who can file hours has no business
/// reading what the rest of the crew earns. The two lists are append-only by design — a rate is
/// never edited into another rate, and an hour-bank balance is never typed in — because both are
/// read backwards months later to explain a cheque somebody is arguing about.
/// </summary>
[ApiController]
[Route("api/rh/employes/{employeeId:guid}")]
[StaffOnly]
[Authorize(Roles = Roles.Owner)]
[RequireActiveSubscription]
public class EmployeePayController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    // ---- Salaires ----

    [HttpGet("salaires")]
    public async Task<ActionResult<List<EmployeeWageDto>>> Wages(Guid employeeId, CancellationToken ct)
    {
        var rows = await db.EmployeeWages.AsNoTracking()
            .Where(w => w.EmployeeId == employeeId)
            .OrderByDescending(w => w.EffectiveOn).ThenByDescending(w => w.CreatedAt)
            .ToListAsync(ct);

        // The one in force is the most recent row that has already started. A raise dated next
        // month sits at the top of the list without being the rate anybody is paid today, and
        // marking it current would have the payroll read the wrong number for three weeks.
        var today = BusinessDay.Today;
        var currentId = rows.FirstOrDefault(w => w.EffectiveOn <= today)?.Id;

        return Ok(rows
            .Select(w => new EmployeeWageDto(w.Id, w.EffectiveOn, w.Kind, w.Amount, w.Note, w.Id == currentId))
            .ToList());
    }

    [HttpPost("salaires")]
    [RequireBusinessTenant]
    public async Task<ActionResult<EmployeeWageDto>> AddWage(
        Guid employeeId, SaveEmployeeWageRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        if (request.Amount <= 0) return BadRequest(new { message = "Le montant doit être supérieur à zéro." });
        if (request.Amount > 10_000_000m) return BadRequest(new { message = "Ce montant dépasse ce qu'un salaire peut valoir." });
        if (!await db.Employees.AnyAsync(e => e.Id == employeeId, ct))
        {
            return NotFound(new { message = "Cet employé n'existe plus." });
        }

        // Two rates starting the same day cannot both be in force, and whichever won would be
        // down to the order rows came back in.
        if (await db.EmployeeWages.AnyAsync(w => w.EmployeeId == employeeId && w.EffectiveOn == request.EffectiveOn, ct))
        {
            return Conflict(new { message = "Un taux commence déjà à cette date. Modifiez-le ou choisissez une autre date." });
        }

        var wage = new EmployeeWage
        {
            TenantId = tenantId,
            EmployeeId = employeeId,
            EffectiveOn = request.EffectiveOn,
            Kind = request.Kind,
            Amount = request.Amount,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
            CreatedByUserId = currentUser.UserId
        };

        db.EmployeeWages.Add(wage);
        await db.SaveChangesAsync(ct);

        // Worked out here rather than read back off the list action: an ActionResult built with
        // Ok(...) carries its payload in Result, not Value, so unwrapping it returned a row
        // that always said "not the current rate" — including for the first rate somebody set.
        var current = await db.EmployeeWages.AsNoTracking()
            .Where(w => w.EmployeeId == employeeId && w.EffectiveOn <= BusinessDay.Today)
            .OrderByDescending(w => w.EffectiveOn).ThenByDescending(w => w.CreatedAt)
            .Select(w => (Guid?)w.Id)
            .FirstOrDefaultAsync(ct);

        return Ok(new EmployeeWageDto(
            wage.Id, wage.EffectiveOn, wage.Kind, wage.Amount, wage.Note, current == wage.Id));
    }

    /// <summary>
    /// Deleting a rate is for the one that was typed wrong five minutes ago. It is allowed at
    /// any age because nothing here is posted to a ledger — but the history is the point of the
    /// table, so the screen says so rather than offering it as a tidy-up.
    /// </summary>
    [HttpDelete("salaires/{id:guid}")]
    public async Task<IActionResult> DeleteWage(Guid employeeId, Guid id, CancellationToken ct)
    {
        var wage = await db.EmployeeWages.FirstOrDefaultAsync(w => w.Id == id && w.EmployeeId == employeeId, ct);
        if (wage is null) return NotFound();

        db.EmployeeWages.Remove(wage);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Banque d'heures ----

    [HttpGet("banque-heures")]
    public async Task<ActionResult<HourBankDto>> HourBank(Guid employeeId, CancellationToken ct)
    {
        var rows = await db.HourBankEntries.AsNoTracking()
            .Where(h => h.EmployeeId == employeeId)
            .OrderByDescending(h => h.Date).ThenByDescending(h => h.CreatedAt)
            .Select(h => new HourBankEntryDto(h.Id, h.Date, h.Hours, h.Reason, h.CreatedAt))
            .ToListAsync(ct);

        // Added up here rather than in SQL: the list is already in hand, and a balance computed
        // in a second query is a balance that can disagree with the rows under it.
        var banked = rows.Where(h => h.Hours > 0).Sum(h => h.Hours);
        var taken = rows.Where(h => h.Hours < 0).Sum(h => -h.Hours);

        return Ok(new HourBankDto(banked - taken, banked, taken, rows));
    }

    [HttpPost("banque-heures")]
    [RequireBusinessTenant]
    public async Task<ActionResult<HourBankDto>> AddHourBankEntry(
        Guid employeeId, SaveHourBankEntryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        if (request.Hours == 0) return BadRequest(new { message = "Un mouvement de zéro heure ne dit rien." });
        if (Math.Abs(request.Hours) > 2000m) return BadRequest(new { message = "Ce nombre d'heures dépasse ce qu'une année de travail contient." });
        if (string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { message = "Dites pourquoi : c'est ce qui rend la banque lisible dans six mois." });
        if (!await db.Employees.AnyAsync(e => e.Id == employeeId, ct))
        {
            return NotFound(new { message = "Cet employé n'existe plus." });
        }

        db.HourBankEntries.Add(new HourBankEntry
        {
            TenantId = tenantId,
            EmployeeId = employeeId,
            Date = request.Date,
            Hours = request.Hours,
            Reason = request.Reason.Trim(),
            CreatedByUserId = currentUser.UserId
        });

        await db.SaveChangesAsync(ct);
        return await HourBank(employeeId, ct);
    }

    [HttpDelete("banque-heures/{id:guid}")]
    public async Task<ActionResult<HourBankDto>> DeleteHourBankEntry(Guid employeeId, Guid id, CancellationToken ct)
    {
        var entry = await db.HourBankEntries.FirstOrDefaultAsync(h => h.Id == id && h.EmployeeId == employeeId, ct);
        if (entry is null) return NotFound();

        // Refused rather than silently unlinked: the movement is the record of an approved
        // leave, and removing it here would leave the request saying hours came out of a bank
        // they are back in.
        if (await db.LeaveRequests.AnyAsync(l => l.HourBankEntryId == id, ct))
        {
            return Conflict(new { message = "Ce mouvement vient d'un congé approuvé. Annulez le congé pour le retirer." });
        }

        db.HourBankEntries.Remove(entry);
        await db.SaveChangesAsync(ct);
        return await HourBank(employeeId, ct);
    }
}
