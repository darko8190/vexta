using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Reports;

namespace Vexta.Api.Services;

/// <summary>What a report was asked to cover. Both ends optional; the service fills the gaps.</summary>
public record ReportPeriod(DateOnly? From, DateOnly? To);

public interface IReportService
{
    /// <summary>Every calculation that exists, and whether its query is written yet.</summary>
    IReadOnlyList<ReportKeyDto> Catalog();

    bool IsImplemented(string key);

    /// <summary>
    /// Runs one report against the current tenant, or null when the key has no query behind it
    /// yet. Null rather than an empty result: "nothing to show" and "not built" are different
    /// answers and the page says them differently.
    /// </summary>
    Task<ReportResultDto?> RunAsync(string key, ReportPeriod period, CancellationToken ct = default);
}

public class ReportService(VextaDbContext db) : IReportService
{
    /// <summary>
    /// Every key, its name for the super admin's list, and the query that answers it. A key with
    /// no runner is still offered: it can be defined and placed now, and the page behind it says
    /// plainly that the calculation is still to come rather than drawing an empty table.
    /// </summary>
    private static readonly Dictionary<string, string> Labels = new(StringComparer.Ordinal)
    {
        [ReportKeys.ProjectProfitability] = "Rentabilité par projet",
        [ReportKeys.ProjectPipeline] = "Projets par statut",
        [ReportKeys.HoursByEmployee] = "Heures par employé",
        [ReportKeys.TaskLoad] = "Charge de tâches",
        [ReportKeys.UnpaidInvoices] = "Factures impayées",
        [ReportKeys.SalesByMonth] = "Ventes par mois",
        [ReportKeys.InventoryValue] = "Valeur de l'inventaire",
        [ReportKeys.ExpensesByType] = "Dépenses par type"
    };

    private static readonly IReadOnlySet<string> Implemented = new HashSet<string>(StringComparer.Ordinal)
    {
        ReportKeys.HoursByEmployee, ReportKeys.TaskLoad, ReportKeys.ProjectPipeline
    };

    public IReadOnlyList<ReportKeyDto> Catalog() =>
        Labels
            .Select(pair => new ReportKeyDto(pair.Key, pair.Value, Implemented.Contains(pair.Key)))
            .OrderByDescending(k => k.IsImplemented)
            .ThenBy(k => k.Label, StringComparer.CurrentCulture)
            .ToList();

    public bool IsImplemented(string key) => Implemented.Contains(key);

    public Task<ReportResultDto?> RunAsync(string key, ReportPeriod period, CancellationToken ct = default) =>
        key switch
        {
            ReportKeys.HoursByEmployee => HoursByEmployeeAsync(period, ct),
            ReportKeys.TaskLoad => TaskLoadAsync(ct),
            ReportKeys.ProjectPipeline => ProjectPipelineAsync(period, ct),
            _ => Task.FromResult<ReportResultDto?>(null)
        };

    /// <summary>
    /// Hours logged per employee over a period, with the number of jobs they were spread over.
    ///
    /// Hours with no employee on them are kept as their own row rather than dropped: a company
    /// whose total does not match its timesheets would rightly stop trusting the page.
    /// </summary>
    private async Task<ReportResultDto?> HoursByEmployeeAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);

        var rows = await db.TimesheetEntries.AsNoTracking()
            .Where(t => t.StartDate >= from && t.StartDate <= to)
            .GroupBy(t => new { t.EmployeeId, Name = t.Employee!.FirstName + " " + t.Employee.LastName })
            .Select(g => new
            {
                g.Key.EmployeeId,
                g.Key.Name,
                Hours = g.Sum(t => t.Hours),
                Projects = g.Select(t => t.ProjectId).Distinct().Count(),
                Entries = g.Count()
            })
            .ToListAsync(ct);

        var ordered = rows.OrderByDescending(r => r.Hours).ToList();

        return new ReportResultDto(
            Labels[ReportKeys.HoursByEmployee],
            PeriodLabel(from, to),
            [
                new ReportColumnDto("Employé"),
                new ReportColumnDto("Heures", Numeric: true),
                new ReportColumnDto("Projets", Numeric: true),
                new ReportColumnDto("Entrées", Numeric: true)
            ],
            ordered
                .Select(r => (IReadOnlyList<string>)
                [
                    r.EmployeeId is null ? "Sans employé assigné" : r.Name,
                    Hours(r.Hours),
                    r.Projects.ToString(Culture),
                    r.Entries.ToString(Culture)
                ])
                .ToList(),
            [
                "Total",
                Hours(ordered.Sum(r => r.Hours)),
                "",
                ordered.Sum(r => r.Entries).ToString(Culture)
            ],
            DateTimeOffset.UtcNow);
    }

    /// <summary>
    /// Who is carrying what. One row per employee a task is assigned to, one per team, and one
    /// for the work nobody has been given — which is the row this report exists to surface.
    /// </summary>
    private async Task<ReportResultDto?> TaskLoadAsync(CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);

        var tasks = await db.ProjectTasks.AsNoTracking()
            .Include(t => t.Assignees)
            .Select(t => new
            {
                t.Status,
                t.DueDate,
                t.EstimatedHours,
                TeamName = t.AssignedTeam == null ? null : t.AssignedTeam.Name,
                Assignees = t.Assignees.Select(a => a.FirstName + " " + a.LastName).ToList()
            })
            .ToListAsync(ct);

        // A task handed to three people counts once against each of them: this is a reading of
        // who is carrying what, not a count of tasks, and the totals row says so.
        var buckets = new Dictionary<string, int[]>(StringComparer.CurrentCulture);
        var estimated = new Dictionary<string, decimal>(StringComparer.CurrentCulture);

        foreach (var task in tasks)
        {
            var owners = task.Assignees.Count > 0
                ? task.Assignees
                : [task.TeamName is { } team ? $"Équipe {team}" : "Non assignée"];

            foreach (var owner in owners)
            {
                if (!buckets.TryGetValue(owner, out var counts))
                {
                    counts = new int[5];
                    buckets[owner] = counts;
                }

                counts[(int)task.Status]++;
                if (task.Status != ProjectTaskStatus.Terminee && task.DueDate is { } due && due < today)
                {
                    counts[4]++;
                }

                estimated[owner] = estimated.GetValueOrDefault(owner) + (task.EstimatedHours ?? 0);
            }
        }

        var ordered = buckets
            .OrderByDescending(b => b.Value[4])
            .ThenByDescending(b => b.Value[0] + b.Value[1] + b.Value[2])
            .ThenBy(b => b.Key, StringComparer.CurrentCulture)
            .ToList();

        return new ReportResultDto(
            Labels[ReportKeys.TaskLoad],
            $"{tasks.Count} tâche(s) au total",
            [
                new ReportColumnDto("Assignée à"),
                new ReportColumnDto("À faire", Numeric: true),
                new ReportColumnDto("En cours", Numeric: true),
                new ReportColumnDto("Bloquées", Numeric: true),
                new ReportColumnDto("En retard", Numeric: true),
                new ReportColumnDto("Terminées", Numeric: true),
                new ReportColumnDto("Heures estimées", Numeric: true)
            ],
            ordered
                .Select(b => (IReadOnlyList<string>)
                [
                    b.Key,
                    b.Value[0].ToString(Culture),
                    b.Value[1].ToString(Culture),
                    b.Value[2].ToString(Culture),
                    b.Value[4].ToString(Culture),
                    b.Value[3].ToString(Culture),
                    Hours(estimated.GetValueOrDefault(b.Key))
                ])
                .ToList(),
            null,
            DateTimeOffset.UtcNow);
    }

    /// <summary>How many jobs sit at each stage, and what they are budgeted at.</summary>
    private async Task<ReportResultDto?> ProjectPipelineAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);

        var rows = await db.Projects.AsNoTracking()
            // On the creation date, not the start date: a job with no dates yet is exactly the
            // kind of job this report is meant to show sitting in À faire.
            .Where(p => p.CreatedAt >= from.ToDateTime(TimeOnly.MinValue)
                && p.CreatedAt < to.AddDays(1).ToDateTime(TimeOnly.MinValue))
            .GroupBy(p => p.Status)
            .Select(g => new { Status = g.Key, Count = g.Count(), Budget = g.Sum(p => p.Budget ?? 0) })
            .ToListAsync(ct);

        var byStatus = rows.ToDictionary(r => r.Status);

        // Every status, in pipeline order, including the empty ones: a stage that disappears
        // when it empties makes the list a different shape every month.
        var statuses = Enum.GetValues<ProjectStatus>();

        return new ReportResultDto(
            Labels[ReportKeys.ProjectPipeline],
            PeriodLabel(from, to),
            [
                new ReportColumnDto("Statut"),
                new ReportColumnDto("Projets", Numeric: true),
                new ReportColumnDto("Budget", Numeric: true)
            ],
            statuses
                .Select(status => (IReadOnlyList<string>)
                [
                    StatusLabels[status],
                    (byStatus.TryGetValue(status, out var r) ? r.Count : 0).ToString(Culture),
                    Money(byStatus.TryGetValue(status, out var b) ? b.Budget : 0)
                ])
                .ToList(),
            [
                "Total",
                rows.Sum(r => r.Count).ToString(Culture),
                Money(rows.Sum(r => r.Budget))
            ],
            DateTimeOffset.UtcNow);
    }

    private static readonly Dictionary<ProjectStatus, string> StatusLabels = new()
    {
        [ProjectStatus.AFaire] = "À faire",
        [ProjectStatus.Commence] = "Commencé",
        [ProjectStatus.AFacturer] = "À facturer",
        [ProjectStatus.Facture] = "Facturé",
        [ProjectStatus.Annule] = "Annulé"
    };

    /// <summary>
    /// Year to date when nothing was asked for. A report that defaults to a single month reads
    /// as empty in the first days of January, which is exactly when someone opens it to look
    /// back at the year.
    /// </summary>
    private static (DateOnly From, DateOnly To) Resolve(ReportPeriod period)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        var from = period.From ?? new DateOnly(today.Year, 1, 1);
        var to = period.To ?? today;

        // Swapped rather than refused: two dates the wrong way round is a slip at the picker,
        // and the honest reading of it is the range between them.
        return to < from ? (to, from) : (from, to);
    }

    private static string PeriodLabel(DateOnly from, DateOnly to) =>
        $"Du {from.ToString("d MMMM yyyy", Culture)} au {to.ToString("d MMMM yyyy", Culture)}";

    /// <summary>fr-CA throughout: the figures are read in Québec, whatever the server's locale.</summary>
    private static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("fr-CA");

    private static string Hours(decimal value) => value.ToString("N2", Culture) + " h";

    private static string Money(decimal value) => value.ToString("C2", Culture);
}
