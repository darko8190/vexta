using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

public record ProjectEquipmentDto(
    Guid Id, Guid ProjectId, Guid? EquipmentId, string Name, EquipmentUnit Unit, decimal Quantity,
    decimal? CostRate, decimal? SellingRate, DateOnly? UsedOn, string? Notes,
    Guid? ProjectTaskId, string? ProjectTaskTitle, DateTimeOffset CreatedAt)
{
    public decimal Cost => Math.Round(Quantity * (CostRate ?? 0), 2);
    public decimal Selling => Math.Round(Quantity * (SellingRate ?? 0), 2);
}

/// <param name="EquipmentId">From the company's list; its name, unit and rates fill in what is left blank.</param>
public record SaveProjectEquipmentRequest(
    Guid? EquipmentId, string? Name, EquipmentUnit? Unit, decimal Quantity,
    decimal? CostRate, decimal? SellingRate, DateOnly? UsedOn, string? Notes, Guid? ProjectTaskId = null);

/// <summary>
/// The equipment used on one job. Staff only, reading included: a line carries what the
/// machine costs the company beside what the client pays for it.
/// </summary>
[ApiController]
[Route("api/projects/{projectId:guid}/equipment")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ProjectEquipmentController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProjectEquipmentDto>>> List(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();
        return Ok(await db.ProjectEquipment.AsNoTracking()
            .Where(x => x.ProjectId == projectId)
            .OrderByDescending(x => x.UsedOn).ThenByDescending(x => x.CreatedAt)
            .Select(ToDto()).ToListAsync(ct));
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectEquipmentDto>> Create(Guid projectId, SaveProjectEquipmentRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        var status = await db.Projects.Where(p => p.Id == projectId).Select(p => (ProjectStatus?)p.Status).FirstOrDefaultAsync(ct);
        if (status is null) return NotFound();
        if (ProjectLock.Problem(status.Value) is { } locked) return BadRequest(new { message = locked });
        if (await ProjectTaskLink.ProblemAsync(db, projectId, request.ProjectTaskId, ct) is { } wrongTask)
            return BadRequest(new { message = wrongTask });

        var line = new ProjectEquipment { TenantId = tenantId, ProjectId = projectId, Name = "" };
        if (await ApplyAsync(line, request, ct) is { } problem) return BadRequest(new { message = problem });

        db.ProjectEquipment.Add(line);
        await db.SaveChangesAsync(ct);
        return await GetAsync(line.Id, ct);
    }

    [HttpPut("{id:guid}")]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectEquipmentDto>> Update(Guid id, SaveProjectEquipmentRequest request, CancellationToken ct)
    {
        var line = await db.ProjectEquipment.Include(x => x.Project).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (line is null) return NotFound();
        if (line.Project is { } owner && ProjectLock.Problem(owner.Status) is { } locked) return BadRequest(new { message = locked });
        if (await ProjectTaskLink.ProblemAsync(db, line.ProjectId, request.ProjectTaskId, ct) is { } wrongTask)
            return BadRequest(new { message = wrongTask });
        if (await ApplyAsync(line, request, ct) is { } problem) return BadRequest(new { message = problem });

        line.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var line = await db.ProjectEquipment.Include(x => x.Project).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (line is null) return NotFound();
        if (line.Project is { } owner && ProjectLock.Problem(owner.Status) is { } locked) return BadRequest(new { message = locked });
        db.ProjectEquipment.Remove(line);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Fills the line from the request, with the equipment's own name, unit and rates where the
    /// request leaves them blank — the usual case, since the rates are set once on the equipment.
    /// </summary>
    private async Task<string?> ApplyAsync(ProjectEquipment line, SaveProjectEquipmentRequest r, CancellationToken ct)
    {
        if (r.Quantity <= 0) return "La quantité doit être plus grande que zéro.";
        if (r.Quantity > 100_000) return "Cette quantité est sûrement une faute de frappe.";
        if (r.CostRate is < 0 || r.SellingRate is < 0) return "Un taux ne peut pas être négatif.";
        if (r.Notes is { Length: > 2000 }) return "La note est trop longue.";

        Domain.Equipment? equipment = null;
        if (r.EquipmentId is { } equipmentId)
        {
            equipment = await db.Equipment.AsNoTracking().FirstOrDefaultAsync(e => e.Id == equipmentId, ct);
            if (equipment is null) return "Cet équipement n'existe plus.";
        }

        var name = string.IsNullOrWhiteSpace(r.Name) ? equipment?.Name : r.Name.Trim();
        if (string.IsNullOrWhiteSpace(name)) return "Choisissez un équipement ou donnez un nom à la ligne.";
        if (name.Length > 200) return "Le nom est trop long.";

        line.EquipmentId = r.EquipmentId;
        line.Name = name;
        line.Unit = r.Unit ?? equipment?.Unit ?? EquipmentUnit.Heure;
        line.Quantity = r.Quantity;
        line.CostRate = r.CostRate ?? equipment?.CostRate;
        line.SellingRate = r.SellingRate ?? equipment?.SellingRate;
        line.UsedOn = r.UsedOn;
        line.Notes = string.IsNullOrWhiteSpace(r.Notes) ? null : r.Notes.Trim();
        line.ProjectTaskId = r.ProjectTaskId;
        return null;
    }

    private async Task<ActionResult<ProjectEquipmentDto>> GetAsync(Guid id, CancellationToken ct) =>
        Ok(await db.ProjectEquipment.AsNoTracking().Where(x => x.Id == id).Select(ToDto()).FirstAsync(ct));

    private static System.Linq.Expressions.Expression<Func<ProjectEquipment, ProjectEquipmentDto>> ToDto() => x =>
        new ProjectEquipmentDto(
            x.Id, x.ProjectId, x.EquipmentId, x.Name, x.Unit, x.Quantity, x.CostRate, x.SellingRate,
            x.UsedOn, x.Notes, x.ProjectTaskId, x.ProjectTask == null ? null : x.ProjectTask.Title, x.CreatedAt);
}
