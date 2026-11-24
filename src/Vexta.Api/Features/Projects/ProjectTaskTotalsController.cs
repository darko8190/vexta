using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// What one task cost, what it sold for, and the difference.
/// </summary>
/// <param name="TaskId">
/// Null for the one row that is not a task: everything on the job that nobody attached to one.
/// It is listed rather than dropped, because a figure that does not add up to the project's
/// total is a figure people stop trusting — and because a large unattached row is itself the
/// answer to "why do my tasks not account for the job".
/// </param>
/// <param name="Hours">Hours booked against it. Zero is a real answer and is shown as one.</param>
/// <param name="Cost">What the company paid: materials at their purchase price, and expenses
/// and extra charges at their cost. No labour — see below.</param>
/// <param name="Revenue">What the client is charged: materials and hours at their selling
/// price, plus what the expenses and charges are sold at.</param>
public record ProjectTaskTotalsDto(
    Guid? TaskId,
    string Title,
    ProjectTaskStatus? Status,
    decimal Hours,
    decimal Cost,
    decimal Revenue)
{
    public decimal Profit => Cost == 0m && Revenue == 0m ? 0m : Revenue - Cost;
}

/// <summary>
/// The money on a job, broken down by task.
///
/// This is the figure the tasks were given an owner for: until lines could be attached to one,
/// a project could say what it cost in total and nothing about which part of the work ate it.
///
/// The arithmetic is deliberately the same as the project's own cost table in
/// <see cref="ProjectsController"/> — materials at purchase against selling, hours at the
/// company's rate as revenue only, expenses and extra charges at their two prices. Two
/// different sums over the same rows would produce a task breakdown that does not add up to
/// the total printed above it, and the breakdown is what would be disbelieved.
///
/// Hours carry revenue and no cost on purpose. What a company charges for an hour is settled;
/// what that hour costs it is payroll, which this application does not know. A guessed wage
/// would turn the profit column into fiction.
/// </summary>
[ApiController]
[Route("api/projects/{projectId:guid}/taches/totaux")]
[StaffOnly]
// Managers, not all staff: the row carries what the company paid beside what it charges, and
// the margin on a job is not an employee's to read. The tasks themselves are everyone's.
[Authorize(Roles = Roles.Managers)]
[RequireActiveSubscription]
public class ProjectTaskTotalsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProjectTaskTotalsDto>>> Get(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        var tasks = await db.ProjectTasks.AsNoTracking()
            .Where(t => t.ProjectId == projectId)
            .OrderBy(t => t.Status == ProjectTaskStatus.Terminee)
            .ThenBy(t => t.SortOrder)
            .ThenBy(t => t.CreatedAt)
            .Select(t => new { t.Id, t.Title, t.Status })
            .ToListAsync(ct);

        var rate = await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == currentUser.TenantId)
            .Select(b => b.DefaultHourlyRate)
            .FirstOrDefaultAsync(ct) ?? 0m;

        // Four small grouped reads rather than one join: joining four one-to-many collections
        // onto the tasks multiplies the rows against each other, and the second collection
        // would silently inflate the first's sums.
        var hours = await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.ProjectId == projectId)
            .GroupBy(x => x.ProjectTaskId)
            .Select(g => new { g.Key, Hours = g.Sum(x => x.Hours) })
            .ToListAsync(ct);

        var materials = await db.ProjectMaterials.AsNoTracking()
            .Where(x => x.ProjectId == projectId)
            .GroupBy(x => x.ProjectTaskId)
            .Select(g => new
            {
                g.Key,
                Cost = g.Sum(x => x.Quantity * (x.PurchasePrice ?? 0m)),
                Revenue = g.Sum(x => x.Quantity * x.UnitPrice)
            })
            .ToListAsync(ct);

        var expenses = await db.ProjectExpenses.AsNoTracking()
            .Where(x => x.ProjectId == projectId)
            .GroupBy(x => x.ProjectTaskId)
            .Select(g => new
            {
                g.Key,
                Cost = g.Sum(x => x.Cost ?? 0m),
                Revenue = g.Sum(x => x.SellingPrice ?? 0m)
            })
            .ToListAsync(ct);

        var charges = await db.ProjectExtraCharges.AsNoTracking()
            .Where(x => x.ProjectId == projectId)
            .GroupBy(x => x.ProjectTaskId)
            .Select(g => new
            {
                g.Key,
                Cost = g.Sum(x => x.Cost ?? 0m),
                Revenue = g.Sum(x => x.SellingPrice ?? 0m)
            })
            .ToListAsync(ct);

        ProjectTaskTotalsDto Build(Guid? taskId, string title, ProjectTaskStatus? status)
        {
            var taskHours = hours.FirstOrDefault(x => x.Key == taskId)?.Hours ?? 0m;

            var cost =
                (materials.FirstOrDefault(x => x.Key == taskId)?.Cost ?? 0m)
                + (expenses.FirstOrDefault(x => x.Key == taskId)?.Cost ?? 0m)
                + (charges.FirstOrDefault(x => x.Key == taskId)?.Cost ?? 0m);

            var revenue =
                (materials.FirstOrDefault(x => x.Key == taskId)?.Revenue ?? 0m)
                + (expenses.FirstOrDefault(x => x.Key == taskId)?.Revenue ?? 0m)
                + (charges.FirstOrDefault(x => x.Key == taskId)?.Revenue ?? 0m)
                + taskHours * rate;

            return new ProjectTaskTotalsDto(
                taskId, title, status, Round(taskHours), Round(cost), Round(revenue));
        }

        var rows = tasks.Select(t => Build(t.Id, t.Title, t.Status)).ToList();

        // Last, and only when there is something in it. On a job where every line is attached
        // the row would be a line of zeros, and a line of zeros is noise.
        var loose = Build(null, "Non attribué", null);
        if (loose.Hours != 0m || loose.Cost != 0m || loose.Revenue != 0m) rows.Add(loose);

        return Ok(rows);
    }

    /// <summary>Away from zero, the way money rounds here — see InvoiceTotals.</summary>
    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
