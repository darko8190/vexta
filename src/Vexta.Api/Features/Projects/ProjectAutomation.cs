using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// What happens to a project on its own: the automatic lines from Paramètres › Projets, and the
/// move to « À facturer » once every task on it is done.
/// </summary>
public static class ProjectAutomation
{
    /// <summary>
    /// Adds the company's active automatic lines for this event to the project. Does not save.
    /// For a task event, a rule with no type answers every task and a typed rule only its own.
    /// </summary>
    public static async Task AddLinesAsync(
        VextaDbContext db, Guid tenantId, Guid projectId, AutoLineEvent trigger, Guid? taskTypeId, Guid? taskId,
        CancellationToken ct)
    {
        var rules = await db.ProjectAutoLines.AsNoTracking()
            .Where(l => l.TenantId == tenantId && l.IsActive && l.Event == trigger)
            .Where(l => trigger != AutoLineEvent.TacheCreee || l.TaskTypeId == null || l.TaskTypeId == taskTypeId)
            .OrderBy(l => l.SortOrder).ThenBy(l => l.CreatedAt)
            .ToListAsync(ct);
        if (rules.Count == 0) return;

        var defaultRate = await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == tenantId)
            .Select(b => b.DefaultHourlyRate)
            .FirstOrDefaultAsync(ct);
        var today = Common.BusinessDay.Today;

        foreach (var rule in rules)
        {
            switch (rule.Section)
            {
                case AutoLineSection.MainDoeuvre:
                    // Hours with nobody on them yet: the office names the employee later, or
                    // leaves the line as the hours the job is billed for.
                    db.TimesheetEntries.Add(new TimesheetEntry
                    {
                        TenantId = tenantId,
                        ProjectId = projectId,
                        ProjectTaskId = taskId,
                        StartDate = today,
                        EndDate = today,
                        StartTime = TimeOnly.MinValue,
                        EndTime = TimeOnly.MinValue,
                        Hours = rule.Quantity,
                        HourlyRate = rule.UnitPrice > 0 ? rule.UnitPrice : defaultRate,
                        Note = rule.Description
                    });
                    break;
                case AutoLineSection.Materiaux:
                    db.ProjectMaterials.Add(new ProjectMaterial
                    {
                        TenantId = tenantId,
                        ProjectId = projectId,
                        ProjectTaskId = taskId,
                        Description = rule.Description,
                        Quantity = rule.Quantity,
                        PurchasePrice = rule.UnitCost,
                        UnitPrice = rule.UnitPrice
                    });
                    break;
                case AutoLineSection.Equipements:
                    db.ProjectEquipment.Add(new ProjectEquipment
                    {
                        TenantId = tenantId,
                        ProjectId = projectId,
                        ProjectTaskId = taskId,
                        Name = rule.Description,
                        Quantity = rule.Quantity,
                        CostRate = rule.UnitCost,
                        SellingRate = rule.UnitPrice,
                        UsedOn = today
                    });
                    break;
                case AutoLineSection.FraisSupplementaires:
                    db.ProjectExtraCharges.Add(new ProjectExtraCharge
                    {
                        TenantId = tenantId,
                        ProjectId = projectId,
                        ProjectTaskId = taskId,
                        Name = rule.Description,
                        Cost = rule.UnitCost is { } cost ? Math.Round(cost * rule.Quantity, 2) : null,
                        SellingPrice = Math.Round(rule.UnitPrice * rule.Quantity, 2),
                        ChargedOn = today
                    });
                    break;
            }
        }
    }

    /// <summary>
    /// Puts the project at « À facturer » when it has tasks and all of them are done, the
    /// changes being saved included. Only from À faire or Commencé: a project already billed or
    /// cancelled is not brought back. Saves when it moves.
    /// </summary>
    public static async Task MarkReadyToBillAsync(VextaDbContext db, Guid? projectId, CancellationToken ct)
    {
        if (projectId is not { } id) return;
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (project is null || project.Status is not (ProjectStatus.AFaire or ProjectStatus.Commence)) return;

        var statuses = await db.ProjectTasks.Where(t => t.ProjectId == id).Select(t => t.Status).ToListAsync(ct);
        if (statuses.Count == 0 || statuses.Any(s => s != ProjectTaskStatus.Terminee)) return;

        project.Status = ProjectStatus.AFacturer;
        project.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }
}
