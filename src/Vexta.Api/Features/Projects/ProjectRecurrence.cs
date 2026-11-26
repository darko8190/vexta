using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// A job that comes back — the furnace serviced every fall, the lawn every week. The project
/// that carries the schedule is the model; on each date a new project is copied from it, with
/// its tasks, and goes on like any other. The copies carry no schedule of their own, so the
/// model is the one place to change or stop it.
/// </summary>
public static class ProjectRecurrence
{
    public const int MaxEvery = 99;

    public static string? Problem(UpsertProjectRequest request)
    {
        if (request.RecurrenceEvery is not { } every || every <= 0) return null;
        if (every > MaxEvery) return $"Une récurrence va jusqu'à {MaxEvery} {Label(request.RecurrenceUnit)}.";
        if (!Enum.IsDefined(request.RecurrenceUnit)) return "Choisissez semaines, mois ou années.";
        if (request.RecurrenceEndDate is { } end && request.StartDate is { } start && end < start)
            return "La fin de la récurrence est avant le début du projet.";
        return null;
    }

    /// <summary>
    /// Sets the schedule from the form, and works out the next date from the project's start:
    /// the first one after today. Counted from the start each time rather than from the last
    /// copy, so a job on the 31st comes back on the 31st after a short month.
    /// </summary>
    public static void Apply(Project project, UpsertProjectRequest request, DateOnly today)
    {
        if (request.RecurrenceEvery is not { } every || every <= 0)
        {
            project.RecurrenceEvery = null;
            project.RecurrenceNextDate = null;
            project.RecurrenceEndDate = null;
            return;
        }

        project.RecurrenceEvery = every;
        project.RecurrenceUnit = request.RecurrenceUnit;
        project.RecurrenceEndDate = request.RecurrenceEndDate;
        project.RecurrenceNextDate = NextAfter(project.StartDate ?? today, every, request.RecurrenceUnit, today, request.RecurrenceEndDate);
    }

    /// <summary>The first date of the series strictly after <paramref name="after"/>, or null past the end.</summary>
    public static DateOnly? NextAfter(DateOnly anchor, int every, RecurrenceUnit unit, DateOnly after, DateOnly? end)
    {
        for (var k = 1; k < 10_000; k++)
        {
            var date = Add(anchor, unit, every * k);
            if (date > after) return end is { } last && date > last ? null : date;
        }

        return null;
    }

    public static DateOnly Add(DateOnly date, RecurrenceUnit unit, int count) => unit switch
    {
        RecurrenceUnit.Semaine => date.AddDays(7 * count),
        RecurrenceUnit.Annee => date.AddYears(count),
        _ => date.AddMonths(count),
    };

    private static string Label(RecurrenceUnit unit) => unit switch
    {
        RecurrenceUnit.Semaine => "semaines",
        RecurrenceUnit.Annee => "années",
        _ => "mois",
    };
}

/// <summary>
/// Makes the copies of recurring projects whose date has come. Hourly, like the other passes;
/// a copy is a new project in its company, numbered from the company's own counter.
/// </summary>
public class ProjectRecurrenceService(
    IServiceScopeFactory scopes,
    ILogger<ProjectRecurrenceService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private const int MaxPerRun = 100;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(75), stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Recurring project pass failed.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        List<Guid> due;
        var today = BusinessDay.Today;
        var now = DateTimeOffset.UtcNow;

        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();
            due = await db.Projects.IgnoreQueryFilters().AsNoTracking()
                .Where(p => p.RecurrenceEvery != null && p.RecurrenceNextDate != null && p.RecurrenceNextDate <= today)
                .Join(db.Tenants.IgnoreQueryFilters(), p => p.TenantId, t => t.Id, (p, t) => new { p, t })
                // A company that has stopped paying gets no new work made for it.
                .Where(x => x.t.Kind == TenantKind.Business
                    && (x.t.SubscriptionStatus == TenantSubscriptionStatus.Active
                        || (x.t.SubscriptionStatus == TenantSubscriptionStatus.Trialing && x.t.TrialEndsAt > now)))
                .OrderBy(x => x.p.RecurrenceNextDate)
                .Take(MaxPerRun)
                .Select(x => x.p.Id)
                .ToListAsync(ct);
        }

        var made = 0;
        foreach (var id in due)
        {
            try
            {
                if (await CopyAsync(id, today, ct)) made++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // One broken model must not hold up the others behind it.
                logger.LogError(ex, "Recurring project {ProjectId} failed.", id);
            }
        }

        return made;
    }

    private async Task<bool> CopyAsync(Guid modelId, DateOnly today, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();

        var model = await db.Projects.IgnoreQueryFilters()
            .Include(p => p.Client)
            .Include(p => p.Tasks).ThenInclude(t => t.Assignees)
            .FirstOrDefaultAsync(p => p.Id == modelId, ct);
        if (model?.RecurrenceEvery is not { } every || model.RecurrenceNextDate is not { } date) return false;

        // A closed or barred client: the schedule stops rather than piling up work nobody may do.
        if (model.Client?.WorkRefusal() is not null)
        {
            model.RecurrenceNextDate = null;
            await db.SaveChangesAsync(ct);
            return false;
        }

        var shift = model.StartDate is { } start ? date.DayNumber - start.DayNumber : 0;
        DateOnly? Shifted(DateOnly? day) => day?.AddDays(shift);

        var number = (await db.Projects.IgnoreQueryFilters()
            .Where(p => p.TenantId == model.TenantId)
            .MaxAsync(p => (int?)p.Number, ct) ?? 0) + 1;

        var copy = new Project
        {
            TenantId = model.TenantId,
            Number = number,
            ClientId = model.ClientId,
            PoNumber = model.PoNumber,
            Description = model.Description,
            Status = ProjectStatus.AFaire,
            StartDate = date,
            EndDate = model.StartDate is null ? model.EndDate : Shifted(model.EndDate),
            Budget = model.Budget,
            IsTaxExempt = model.IsTaxExempt,
            PricePolicyId = model.PricePolicyId,
            ClientAssetId = model.ClientAssetId,
            ClientAddressId = model.ClientAddressId,
            SameAddressAsClient = model.SameAddressAsClient,
            SiteAddressId = model.SiteAddressId,
            CategoryId = model.CategoryId,
            SubCategoryId = model.SubCategoryId,
            WageClassificationId = model.WageClassificationId,
            ContactId = model.ContactId,
            BillingContactId = model.BillingContactId,
            RecurringFromId = model.Id,
            Tasks = [.. model.Tasks.OrderBy(t => t.SortOrder).Select(t => new ProjectTask
            {
                TenantId = model.TenantId,
                Title = t.Title,
                Description = t.Description,
                Priority = t.Priority,
                StartDate = Shifted(t.StartDate),
                DueDate = Shifted(t.DueDate),
                EstimatedHours = t.EstimatedHours,
                AssignedTeamId = t.AssignedTeamId,
                Assignees = [.. t.Assignees],
                SortOrder = t.SortOrder,
            })],
        };

        db.Projects.Add(copy);
        model.RecurrenceNextDate = ProjectRecurrence.NextAfter(
            model.StartDate ?? date, every, model.RecurrenceUnit, date, model.RecurrenceEndDate);
        model.UpdatedAt = DateTimeOffset.UtcNow;

        // The copy and the advanced date in one save, or the next pass would copy the same date twice.
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Recurring project {ProjectId} made P-{Number:0000} for {Date}.", modelId, number, date);
        return true;
    }
}
