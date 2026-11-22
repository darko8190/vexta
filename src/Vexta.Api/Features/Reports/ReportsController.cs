using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Reports;

/// <summary>
/// The reports one company may open, and their results.
///
/// Everyone who works there, because the module each report hangs off is already what decides
/// who sees it — and that is finer than a role could be. The human resources reports sit on an
/// owner-only module and stay with the owner; the project ones show an employee the same
/// figures the project screens already show them. Reserving the whole page to managers would
/// instead put an entry in the sidebar of every employee that answers 403.
/// </summary>
[ApiController]
[Route("api/rapports")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ReportsController(
    VextaDbContext db, ICurrentUserService currentUser, IReportService reports) : ControllerBase
{
    /// <summary>
    /// What this company is offered: the published reports whose module its plan includes.
    ///
    /// A company with no plan — every tenant created by hand — gets every published report
    /// rather than none, the same fallback the sidebar makes. An empty page with no explanation
    /// reads as a broken module, and the super admin has no way to tell it apart from one.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ReportDto>>> List(CancellationToken ct) =>
        Ok(await OfferedAsync(ct));

    /// <summary>
    /// The list itself, rather than the action that wraps it. Run() needs the rows, and reading
    /// them back out of its own ActionResult does not work: an Ok(...) carries its payload in
    /// Result, not in Value, so the check came back empty and every report answered 403.
    /// </summary>
    private async Task<IReadOnlyList<ReportDto>> OfferedAsync(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return [];

        var planId = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.PlanId)
            .FirstOrDefaultAsync(ct);

        var query = db.Reports.AsNoTracking().Where(r => r.IsPublished && r.Module!.IsPublished);

        if (planId is { } plan)
        {
            query = query.Where(r => r.Module!.Plans.Any(p => p.Id == plan));
        }

        // Owner-only modules stay owner-only here, which is what keeps the human resources
        // figures with the owner — a chargé de projet is not offered them either, for the same
        // reason the sidebar does not offer them the module.
        var isOwner = currentUser.Role == UserRole.TenantAdmin || currentUser.IsImpersonating;
        if (!isOwner)
        {
            query = query.Where(r => !r.Module!.OwnerOnly);
        }

        var rows = await query
            .OrderBy(r => r.Module!.SortOrder).ThenBy(r => r.SortOrder).ThenBy(r => r.Title)
            .Select(r => new
            {
                r.Id, r.Key, r.Title, r.Description, r.Icon, r.ModuleId,
                ModuleTitle = r.Module!.Title
            })
            .ToListAsync(ct);

        return rows
            .Select(r => new ReportDto(
                r.Id, r.Key, r.Title, r.Description, r.Icon, r.ModuleId, r.ModuleTitle,
                reports.IsImplemented(r.Key)))
            .ToList();
    }

    /// <summary>
    /// Runs one of them. Asked for by the row's id rather than by its key, so a company can only
    /// run what it was offered — a key alone would be a way of running a report that belongs to
    /// a module somebody else pays for.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ReportResultDto>> Run(
        Guid id, [FromQuery] DateOnly? du, [FromQuery] DateOnly? au, CancellationToken ct)
    {
        var offered = await OfferedAsync(ct);

        var report = offered.FirstOrDefault(r => r.Id == id);
        if (report is null) return NotFound();

        var result = await reports.RunAsync(report.Key, new ReportPeriod(du, au), ct);
        if (result is null)
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new
            {
                message = "Ce rapport est défini mais son calcul n'est pas encore en place."
            });
        }

        // The super admin's title wins over the one the calculation carries: the row is the
        // offer, and renaming a report is something they do without a deployment.
        return Ok(result with { Title = report.Title });
    }
}
