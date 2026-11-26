using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>An extra charge as the project's list shows it.</summary>
public record ProjectExtraChargeDto(
    Guid Id,
    Guid ProjectId,
    string Name,
    string? Description,
    decimal? Cost,
    decimal? SellingPrice,
    DateOnly? ChargedOn,
    /// <summary>
    /// The task on this job it belongs to, and that task's title for the list. Both null for a
    /// line posted against the job as a whole, which is most of them.
    /// </summary>
    Guid? ProjectTaskId,
    string? ProjectTaskTitle,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    bool IsBillable = true);

public record SaveProjectExtraChargeRequest(
    string Name,
    string? Description,
    decimal? Cost,
    decimal? SellingPrice,
    DateOnly? ChargedOn,
    /// <summary>Optional: the task this charge belongs to.</summary>
    Guid? ProjectTaskId = null,
    /// <summary>Charged to the project. Null keeps what it was (true for a new one).</summary>
    bool? IsBillable = null);

/// <summary>
/// The extra charges added to one project.
///
/// Staff only, including for reading, for the same reason as the expenses: the row carries what
/// the company paid beside what it charges, and a customer who reads their own project has no
/// business reading the margin on it.
/// </summary>
[ApiController]
[Route("api/projects/{projectId:guid}/extra-charges")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ProjectExtraChargesController(
    VextaDbContext db,
    ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProjectExtraChargeDto>>> List(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        var items = await db.ProjectExtraCharges.AsNoTracking()
            .Where(x => x.ProjectId == projectId)
            .OrderByDescending(x => x.ChargedOn)
            .ThenByDescending(x => x.CreatedAt)
            .Select(ToDto())
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectExtraChargeDto>> Get(Guid id, CancellationToken ct)
    {
        var charge = await db.ProjectExtraCharges.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(ToDto())
            .FirstOrDefaultAsync(ct);

        return charge is null ? NotFound() : Ok(charge);
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectExtraChargeDto>> Create(
        Guid projectId, SaveProjectExtraChargeRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var status = await db.Projects.Where(p => p.Id == projectId)
            .Select(p => (ProjectStatus?)p.Status).FirstOrDefaultAsync(ct);
        if (status is null) return NotFound();

        // A billed job takes no new charges: it would be money nobody put on the invoice.
        if (ProjectLock.Problem(status.Value) is { } locked) return BadRequest(new { message = locked });
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        if (await ProjectTaskLink.ProblemAsync(db, projectId, request.ProjectTaskId, ct) is { } wrongTask)
        {
            return BadRequest(new { message = wrongTask });
        }

        var charge = new ProjectExtraCharge
        {
            TenantId = tenantId,
            ProjectId = projectId,
            Name = request.Name.Trim(),
            Description = Clean(request.Description),
            Cost = request.Cost,
            SellingPrice = request.SellingPrice,
            ChargedOn = request.ChargedOn,
            ProjectTaskId = request.ProjectTaskId,
            IsBillable = request.IsBillable ?? true
        };

        db.ProjectExtraCharges.Add(charge);
        await db.SaveChangesAsync(ct);

        return await Get(charge.Id, ct);
    }

    [HttpPut("{id:guid}")]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectExtraChargeDto>> Update(
        Guid id, SaveProjectExtraChargeRequest request, CancellationToken ct)
    {
        var charge = await db.ProjectExtraCharges.Include(x => x.Project)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (charge is null) return NotFound();

        if (charge.Project is { } owner && ProjectLock.Problem(owner.Status) is { } locked)
        {
            return BadRequest(new { message = locked });
        }

        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        if (await ProjectTaskLink.ProblemAsync(db, charge.ProjectId, request.ProjectTaskId, ct) is { } wrongTask)
        {
            return BadRequest(new { message = wrongTask });
        }

        charge.Name = request.Name.Trim();
        charge.Description = Clean(request.Description);
        charge.Cost = request.Cost;
        charge.SellingPrice = request.SellingPrice;
        charge.ChargedOn = request.ChargedOn;
        charge.ProjectTaskId = request.ProjectTaskId;
        charge.IsBillable = request.IsBillable ?? charge.IsBillable;
        charge.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return await Get(charge.Id, ct);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var charge = await db.ProjectExtraCharges.Include(x => x.Project)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (charge is null) return NotFound();

        if (charge.Project is { } owner && ProjectLock.Problem(owner.Status) is { } locked)
        {
            return BadRequest(new { message = locked });
        }

        db.ProjectExtraCharges.Remove(charge);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Problem(SaveProjectExtraChargeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Le nom du frais est obligatoire.";
        if (request.Name.Trim().Length > 200) return "Le nom du frais est trop long.";
        if (request.Description is { Length: > 2000 }) return "La description est trop longue.";
        if (request.Cost is < 0 || request.SellingPrice is < 0)
        {
            return "Un montant ne peut pas être négatif.";
        }

        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static System.Linq.Expressions.Expression<Func<ProjectExtraCharge, ProjectExtraChargeDto>> ToDto() =>
        x => new ProjectExtraChargeDto(
            x.Id,
            x.ProjectId,
            x.Name,
            x.Description,
            x.Cost,
            x.SellingPrice,
            x.ChargedOn,
            x.ProjectTaskId,
            x.ProjectTask == null ? null : x.ProjectTask.Title,
            x.CreatedAt,
            x.UpdatedAt,
            x.IsBillable);
}
