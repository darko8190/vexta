using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Reports;

/// <summary>
/// The catalogue of reports, managed by the platform the way plans and modules are.
///
/// Every row names a module, and that is what decides who is offered it: a company whose plan
/// does not include Inventaire is not shown the inventory reports. So the super admin decides
/// what exists and what sells it, and nothing has to be kept in step by hand afterwards.
/// </summary>
[ApiController]
[Route("api/admin/rapports")]
[Authorize(Roles = Roles.Platform)]
public class AdminReportsController(VextaDbContext db, IReportService reports) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AdminReportDto>>> List(CancellationToken ct)
    {
        var rows = await db.Reports.AsNoTracking()
            .OrderBy(r => r.Module!.SortOrder).ThenBy(r => r.SortOrder).ThenBy(r => r.Title)
            .Select(r => new AdminReportDto(
                r.Id, r.ModuleId, r.Module!.Title, r.Key, r.Title, r.Description, r.Icon,
                r.SortOrder, r.IsPublished))
            .ToListAsync(ct);

        return Ok(rows);
    }

    /// <summary>The calculations that exist, so the form offers exactly those.</summary>
    [HttpGet("cles")]
    public ActionResult<IReadOnlyList<ReportKeyDto>> Keys() => Ok(reports.Catalog());

    [HttpPost]
    public async Task<ActionResult<AdminReportDto>> Create(SaveReportRequest request, CancellationToken ct)
    {
        if (await ValidateAsync(request, ct) is { } error) return BadRequest(new { message = error });

        var report = new Report
        {
            ModuleId = request.ModuleId,
            Key = request.Key,
            Title = request.Title.Trim(),
            Description = request.Description.Trim(),
            Icon = request.Icon,
            SortOrder = request.SortOrder,
            IsPublished = request.IsPublished
        };

        db.Reports.Add(report);
        await db.SaveChangesAsync(ct);

        return Ok(await ReadAsync(report.Id, ct));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<AdminReportDto>> Update(
        Guid id, SaveReportRequest request, CancellationToken ct)
    {
        var report = await db.Reports.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (report is null) return NotFound();
        if (await ValidateAsync(request, ct) is { } error) return BadRequest(new { message = error });

        report.ModuleId = request.ModuleId;
        report.Key = request.Key;
        report.Title = request.Title.Trim();
        report.Description = request.Description.Trim();
        report.Icon = request.Icon;
        report.SortOrder = request.SortOrder;
        report.IsPublished = request.IsPublished;
        report.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(await ReadAsync(id, ct));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var report = await db.Reports.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (report is null) return NotFound();

        // No confirmation gate like a module's: a report row is an offer, not a thing anybody's
        // data hangs off. Deleting it removes the entry and nothing else.
        db.Reports.Remove(report);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private Task<AdminReportDto?> ReadAsync(Guid id, CancellationToken ct) =>
        db.Reports.AsNoTracking()
            .Where(r => r.Id == id)
            .Select(r => new AdminReportDto(
                r.Id, r.ModuleId, r.Module!.Title, r.Key, r.Title, r.Description, r.Icon,
                r.SortOrder, r.IsPublished))
            .FirstOrDefaultAsync(ct);

    private async Task<string?> ValidateAsync(SaveReportRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.Title)) return "Le titre est obligatoire.";
        if (r.Title.Trim().Length > 120) return "Le titre ne peut pas dépasser 120 caractères.";
        if (string.IsNullOrWhiteSpace(r.Description)) return "La description est obligatoire.";
        if (r.Description.Trim().Length > 500) return "La description ne peut pas dépasser 500 caractères.";
        if (!ModuleIcons.IsAllowed(r.Icon)) return "Choisissez une icône dans la liste proposée.";

        // Checked rather than trusted: a key with no calculation behind it would reach a company
        // as a report that opens on nothing, and nobody would know whether that is a bug or a
        // report with no rows this month.
        if (!ReportKeys.IsAllowed(r.Key)) return "Choisissez un calcul dans la liste proposée.";

        if (!await db.Modules.AnyAsync(m => m.Id == r.ModuleId, ct))
        {
            return "Ce module n'existe pas.";
        }

        return null;
    }
}
