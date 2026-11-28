using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

public record NamedItemDto(Guid Id, string Name, int SortOrder);
public record SaveNamedItemRequest(string Name);

public record ProjectAutoLineDto(
    Guid Id, AutoLineEvent Event, Guid? TaskTypeId, string? TaskTypeName, AutoLineSection Section,
    string Description, decimal Quantity, decimal? UnitCost, decimal UnitPrice, bool IsActive, int SortOrder);

public record SaveProjectAutoLineRequest(
    AutoLineEvent Event, Guid? TaskTypeId, AutoLineSection Section, string Description,
    decimal Quantity, decimal? UnitCost, decimal UnitPrice, bool IsActive);

public record ProjectSettingsDto(
    LabourEntryMode LabourMode,
    decimal? DefaultHourlyRate,
    IReadOnlyList<NamedItemDto> TaskTypes,
    IReadOnlyList<NamedItemDto> Priorities,
    IReadOnlyList<ProjectAutoLineDto> AutoLines);

public record SaveLabourModeRequest(LabourEntryMode LabourMode);

/// <summary>
/// Paramètres › Projets: how hours are entered, the kinds of task, the project priorities and
/// the lines added on their own. Read by all staff — the crew's screens follow the labour mode —
/// and changed by managers.
/// </summary>
[ApiController]
[Route("api/parametres-projets")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ProjectSettingsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ProjectSettingsDto>> Get(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        var settings = await SettingsAsync(tenantId, ct);

        // Basse, Moyenne et Haute, once: a company that deletes them does not get them back.
        if (!settings.ProjectPrioritiesSeeded)
        {
            var order = 0;
            foreach (var name in new[] { "Basse", "Moyenne", "Haute" })
                db.ProjectPriorities.Add(new ProjectPriority { TenantId = tenantId, Name = name, SortOrder = order++ });
            settings.ProjectPrioritiesSeeded = true;
            await db.SaveChangesAsync(ct);
        }

        return Ok(new ProjectSettingsDto(
            settings.LabourMode,
            settings.DefaultHourlyRate,
            await db.TaskTypes.AsNoTracking().OrderBy(t => t.SortOrder).ThenBy(t => t.Name)
                .Select(t => new NamedItemDto(t.Id, t.Name, t.SortOrder)).ToListAsync(ct),
            await db.ProjectPriorities.AsNoTracking().OrderBy(t => t.SortOrder).ThenBy(t => t.Name)
                .Select(t => new NamedItemDto(t.Id, t.Name, t.SortOrder)).ToListAsync(ct),
            await db.ProjectAutoLines.AsNoTracking().OrderBy(l => l.SortOrder).ThenBy(l => l.CreatedAt)
                .Select(l => new ProjectAutoLineDto(l.Id, l.Event, l.TaskTypeId, l.TaskType == null ? null : l.TaskType.Name,
                    l.Section, l.Description, l.Quantity, l.UnitCost, l.UnitPrice, l.IsActive, l.SortOrder))
                .ToListAsync(ct)));
    }

    [HttpPut("main-doeuvre")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> SaveLabourMode(SaveLabourModeRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!Enum.IsDefined(request.LabourMode)) return BadRequest(new { message = "Mode inconnu." });
        var settings = await SettingsAsync(tenantId, ct);
        settings.LabourMode = request.LabourMode;
        settings.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Types de tâche ----

    [HttpPost("types")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<NamedItemDto>> CreateType(SaveNamedItemRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (NameProblem(request.Name) is { } problem) return BadRequest(new { message = problem });
        var next = await db.TaskTypes.MaxAsync(t => (int?)t.SortOrder, ct) ?? -1;
        var item = new TaskType { TenantId = tenantId, Name = request.Name.Trim(), SortOrder = next + 1 };
        db.TaskTypes.Add(item);
        await db.SaveChangesAsync(ct);
        return Ok(new NamedItemDto(item.Id, item.Name, item.SortOrder));
    }

    [HttpPut("types/{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<NamedItemDto>> RenameType(Guid id, SaveNamedItemRequest request, CancellationToken ct)
    {
        var item = await db.TaskTypes.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (item is null) return NotFound();
        if (NameProblem(request.Name) is { } problem) return BadRequest(new { message = problem });
        item.Name = request.Name.Trim();
        await db.SaveChangesAsync(ct);
        return Ok(new NamedItemDto(item.Id, item.Name, item.SortOrder));
    }

    /// <summary>The tasks of that type keep going with no type, and its automatic lines answer every task.</summary>
    [HttpDelete("types/{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> DeleteType(Guid id, CancellationToken ct)
    {
        var item = await db.TaskTypes.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (item is null) return NotFound();
        // Rules keyed on it go with it: left untyped they would start firing on every task.
        db.ProjectAutoLines.RemoveRange(await db.ProjectAutoLines.Where(l => l.TaskTypeId == id).ToListAsync(ct));
        db.TaskTypes.Remove(item);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Priorités ----

    [HttpPost("priorites")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<NamedItemDto>> CreatePriority(SaveNamedItemRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (NameProblem(request.Name) is { } problem) return BadRequest(new { message = problem });
        var next = await db.ProjectPriorities.MaxAsync(t => (int?)t.SortOrder, ct) ?? -1;
        var item = new ProjectPriority { TenantId = tenantId, Name = request.Name.Trim(), SortOrder = next + 1 };
        db.ProjectPriorities.Add(item);
        await db.SaveChangesAsync(ct);
        return Ok(new NamedItemDto(item.Id, item.Name, item.SortOrder));
    }

    [HttpPut("priorites/{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<NamedItemDto>> RenamePriority(Guid id, SaveNamedItemRequest request, CancellationToken ct)
    {
        var item = await db.ProjectPriorities.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (item is null) return NotFound();
        if (NameProblem(request.Name) is { } problem) return BadRequest(new { message = problem });
        item.Name = request.Name.Trim();
        await db.SaveChangesAsync(ct);
        return Ok(new NamedItemDto(item.Id, item.Name, item.SortOrder));
    }

    [HttpDelete("priorites/{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> DeletePriority(Guid id, CancellationToken ct)
    {
        var item = await db.ProjectPriorities.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (item is null) return NotFound();
        db.ProjectPriorities.Remove(item);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Lignes automatiques ----

    [HttpPost("lignes-automatiques")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<ProjectAutoLineDto>> CreateLine(SaveProjectAutoLineRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (await LineProblemAsync(request, ct) is { } problem) return BadRequest(new { message = problem });
        var next = await db.ProjectAutoLines.MaxAsync(l => (int?)l.SortOrder, ct) ?? -1;
        var line = new ProjectAutoLine { TenantId = tenantId, Description = "", SortOrder = next + 1 };
        Apply(line, request);
        db.ProjectAutoLines.Add(line);
        await db.SaveChangesAsync(ct);
        return Ok(await LineAsync(line.Id, ct));
    }

    [HttpPut("lignes-automatiques/{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<ProjectAutoLineDto>> UpdateLine(Guid id, SaveProjectAutoLineRequest request, CancellationToken ct)
    {
        var line = await db.ProjectAutoLines.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (line is null) return NotFound();
        if (await LineProblemAsync(request, ct) is { } problem) return BadRequest(new { message = problem });
        Apply(line, request);
        await db.SaveChangesAsync(ct);
        return Ok(await LineAsync(id, ct));
    }

    [HttpDelete("lignes-automatiques/{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> DeleteLine(Guid id, CancellationToken ct)
    {
        var line = await db.ProjectAutoLines.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (line is null) return NotFound();
        db.ProjectAutoLines.Remove(line);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<Domain.BillingSettings> SettingsAsync(Guid tenantId, CancellationToken ct)
    {
        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
        if (settings is not null) return settings;
        settings = new Domain.BillingSettings { TenantId = tenantId };
        db.BillingSettings.Add(settings);
        return settings;
    }

    private async Task<ProjectAutoLineDto?> LineAsync(Guid id, CancellationToken ct) =>
        await db.ProjectAutoLines.AsNoTracking().Where(l => l.Id == id)
            .Select(l => new ProjectAutoLineDto(l.Id, l.Event, l.TaskTypeId, l.TaskType == null ? null : l.TaskType.Name,
                l.Section, l.Description, l.Quantity, l.UnitCost, l.UnitPrice, l.IsActive, l.SortOrder))
            .FirstOrDefaultAsync(ct);

    private static string? NameProblem(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Le nom est requis.";
        if (name.Trim().Length > 100) return "Le nom ne peut pas dépasser 100 caractères.";
        return null;
    }

    private async Task<string?> LineProblemAsync(SaveProjectAutoLineRequest r, CancellationToken ct)
    {
        if (!Enum.IsDefined(r.Event) || !Enum.IsDefined(r.Section)) return "Choix inconnu.";
        if (string.IsNullOrWhiteSpace(r.Description)) return "La description est requise.";
        if (r.Description.Trim().Length > 500) return "La description est trop longue.";
        if (r.Quantity <= 0) return "La quantité doit être plus grande que zéro.";
        if (r.UnitPrice < 0 || r.UnitCost is < 0) return "Les montants ne peuvent pas être négatifs.";
        if (r.Event == AutoLineEvent.TacheCreee && r.TaskTypeId is { } typeId && !await db.TaskTypes.AnyAsync(t => t.Id == typeId, ct))
            return "Ce type de tâche n'existe pas.";
        return null;
    }

    private static void Apply(ProjectAutoLine line, SaveProjectAutoLineRequest r)
    {
        line.Event = r.Event;
        line.TaskTypeId = r.Event == AutoLineEvent.TacheCreee ? r.TaskTypeId : null;
        line.Section = r.Section;
        line.Description = r.Description.Trim();
        line.Quantity = r.Quantity;
        line.UnitCost = r.UnitCost is { } cost ? Math.Round(cost, 2) : null;
        line.UnitPrice = Math.Round(r.UnitPrice, 2);
        line.IsActive = r.IsActive;
    }
}
