using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Clients;

/// <summary>
/// The recurring work planned on one asset: what, how often, when next, and whether the client
/// is written to ahead of it (see AssetMaintenanceReminderService).
///
/// Read like the asset itself — a customer sees the schedule on their own things — and written
/// by the people who run the company.
/// </summary>
[ApiController]
[Route("api/clients/{clientId:guid}/actifs/{assetId:guid}/entretiens")]
[Authorize(Roles = Roles.StaffAndClients)]
[RequireActiveSubscription]
public class AssetMaintenanceController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    private const int MaxIntervalMonths = 120;
    private const int MaxRemindDays = 90;

    [HttpGet]
    public async Task<ActionResult<List<AssetMaintenanceDto>>> List(Guid clientId, Guid assetId, CancellationToken ct)
    {
        if (!await AssetExistsAsync(clientId, assetId, ct)) return NotFound();

        var rows = await db.AssetMaintenances.AsNoTracking()
            .Where(m => m.ClientAssetId == assetId)
            .OrderBy(m => m.NextDue).ThenBy(m => m.Label)
            .ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<AssetMaintenanceDto>> Create(
        Guid clientId, Guid assetId, SaveAssetMaintenanceRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await AssetExistsAsync(clientId, assetId, ct)) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var maintenance = new AssetMaintenance
        {
            TenantId = tenantId,
            ClientAssetId = assetId,
            ClientId = clientId,
            Label = request.Label.Trim(),
            IntervalMonths = request.IntervalMonths,
            NextDue = request.NextDue,
            RemindDaysBefore = request.RemindDaysBefore,
            Notes = Clean(request.Notes),
        };
        db.AssetMaintenances.Add(maintenance);
        await db.SaveChangesAsync(ct);
        return Ok(Map(maintenance));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<AssetMaintenanceDto>> Update(
        Guid clientId, Guid assetId, Guid id, SaveAssetMaintenanceRequest request, CancellationToken ct)
    {
        var maintenance = await FindAsync(clientId, assetId, id, ct);
        if (maintenance is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        maintenance.Label = request.Label.Trim();
        maintenance.IntervalMonths = request.IntervalMonths;
        maintenance.NextDue = request.NextDue;
        maintenance.RemindDaysBefore = request.RemindDaysBefore;
        maintenance.Notes = Clean(request.Notes);
        maintenance.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(Map(maintenance));
    }

    /// <summary>
    /// The visit happened: the next one is counted from the day it was done, not from the day it
    /// was due, because a cleaning done two months late is not due again in ten.
    /// </summary>
    [HttpPost("{id:guid}/fait")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<ActionResult<AssetMaintenanceDto>> MarkDone(
        Guid clientId, Guid assetId, Guid id, MarkMaintenanceDoneRequest request, CancellationToken ct)
    {
        var maintenance = await FindAsync(clientId, assetId, id, ct);
        if (maintenance is null) return NotFound();

        var doneOn = request.DoneOn ?? BusinessDay.Today;
        if (doneOn > BusinessDay.Today)
            return BadRequest(new { message = "La date de l'entretien ne peut pas être dans le futur." });

        maintenance.LastDoneOn = doneOn;
        maintenance.NextDue = doneOn.AddMonths(maintenance.IntervalMonths);
        maintenance.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(Map(maintenance));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid clientId, Guid assetId, Guid id, CancellationToken ct)
    {
        var maintenance = await FindAsync(clientId, assetId, id, ct);
        if (maintenance is null) return NotFound();
        db.AssetMaintenances.Remove(maintenance);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private Task<bool> AssetExistsAsync(Guid clientId, Guid assetId, CancellationToken ct) =>
        db.ClientAssets.AnyAsync(a => a.Id == assetId && a.ClientId == clientId, ct);

    private Task<AssetMaintenance?> FindAsync(Guid clientId, Guid assetId, Guid id, CancellationToken ct) =>
        db.AssetMaintenances.FirstOrDefaultAsync(
            m => m.Id == id && m.ClientAssetId == assetId && m.ClientId == clientId, ct);

    private static string? Problem(SaveAssetMaintenanceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Label)) return "Indiquez ce qui est fait, par exemple « Entretien annuel ».";
        if (request.Label.Trim().Length > 200) return "Le nom est limité à 200 caractères.";
        if (request.IntervalMonths is < 1 or > MaxIntervalMonths)
            return $"La fréquence doit être entre 1 et {MaxIntervalMonths} mois.";
        if (request.RemindDaysBefore is < 1 or > MaxRemindDays)
            return $"Le rappel doit partir entre 1 et {MaxRemindDays} jours avant.";
        if (request.Notes?.Trim().Length > 2000) return "Les notes sont limitées à 2000 caractères.";
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static AssetMaintenanceDto Map(AssetMaintenance m) => new(
        m.Id, m.Label, m.IntervalMonths, m.NextDue, m.RemindDaysBefore,
        m.RemindedFor == m.NextDue ? m.RemindedAt : null, m.LastDoneOn, m.Notes);
}

/// <param name="RemindedAt">When the client was written to about the current due date, if they were.</param>
public record AssetMaintenanceDto(
    Guid Id,
    string Label,
    int IntervalMonths,
    DateOnly NextDue,
    int? RemindDaysBefore,
    DateTimeOffset? RemindedAt,
    DateOnly? LastDoneOn,
    string? Notes);

/// <param name="RemindDaysBefore">Days ahead to write to the client; null for no email.</param>
public record SaveAssetMaintenanceRequest(
    string Label, int IntervalMonths, DateOnly NextDue, int? RemindDaysBefore, string? Notes);

/// <param name="DoneOn">The day it was done; today when not given.</param>
public record MarkMaintenanceDoneRequest(DateOnly? DoneOn);
