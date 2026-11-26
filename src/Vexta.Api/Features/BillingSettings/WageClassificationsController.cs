using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.BillingSettings;

public record WageClassificationStepDto(
    Guid Id, string Name, int SortOrder,
    decimal? Wage, decimal? Cost, decimal? Selling,
    decimal? WageTimeAndHalf, decimal? CostTimeAndHalf, decimal? SellingTimeAndHalf,
    decimal? WageDouble, decimal? CostDouble, decimal? SellingDouble);

public record WageClassificationDto(
    Guid Id,
    string Name,
    int SortOrder,
    /// <summary>How many jobs use it, so deleting it can say what it touches.</summary>
    int ProjectCount,
    IReadOnlyList<WageClassificationStepDto> Steps);

/// <param name="Id">Null for a step added in this save.</param>
public record SaveWageClassificationStepRequest(
    Guid? Id, string Name, decimal? Wage, decimal? Cost, decimal? Selling,
    decimal? WageTimeAndHalf = null, decimal? CostTimeAndHalf = null, decimal? SellingTimeAndHalf = null,
    decimal? WageDouble = null, decimal? CostDouble = null, decimal? SellingDouble = null);

/// <param name="Steps">The whole table, in climbing order. It replaces the whole table.</param>
public record SaveWageClassificationRequest(
    string Name,
    int SortOrder,
    IReadOnlyList<SaveWageClassificationStepRequest>? Steps);

/// <summary>
/// The company's pay classifications and their steps, under Paramètres → Taux.
///
/// Read by everyone who works there, because the classification is chosen on a job and the
/// person opening the job needs the list. Written by the people who run the company: these are
/// the rates the company pays and bills.
///
/// A classification is saved whole, steps included, the way a gallery's photographs are:
/// renaming a step, reordering two and adding a third is one edit of one table, and three
/// separate requests would leave it half-saved the moment one of them failed.
/// </summary>
[ApiController]
[Route("api/classements")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class WageClassificationsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<WageClassificationDto>>> List(CancellationToken ct)
    {
        var items = await db.WageClassifications.AsNoTracking()
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
            .Select(c => new WageClassificationDto(
                c.Id,
                c.Name,
                c.SortOrder,
                c.Projects.Count,
                c.Steps
                    .OrderBy(s => s.SortOrder)
                    .Select(s => new WageClassificationStepDto(
                        s.Id, s.Name, s.SortOrder, s.Wage, s.Cost, s.Selling,
                        s.WageTimeAndHalf, s.CostTimeAndHalf, s.SellingTimeAndHalf,
                        s.WageDouble, s.CostDouble, s.SellingDouble))
                    .ToList()))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<WageClassificationDto>> Create(SaveWageClassificationRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        if (await ExistsAsync(name, null, ct))
        {
            return Conflict(new { message = $"Un classement s'appelle déjà « {name} »." });
        }

        var classification = new WageClassification { TenantId = tenantId, Name = name, SortOrder = request.SortOrder };
        db.WageClassifications.Add(classification);

        ApplySteps(classification, [], request.Steps ?? [], tenantId);

        await db.SaveChangesAsync(ct);
        return Ok(await GetAsync(classification.Id, ct));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<WageClassificationDto>> Update(
        Guid id, SaveWageClassificationRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var classification = await db.WageClassifications.Include(c => c.Steps)
            .FirstOrDefaultAsync(c => c.Id == id, ct);
        if (classification is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        if (await ExistsAsync(name, id, ct))
        {
            return Conflict(new { message = $"Un autre classement s'appelle déjà « {name} »." });
        }

        classification.Name = name;
        classification.SortOrder = request.SortOrder;
        classification.UpdatedAt = DateTimeOffset.UtcNow;

        ApplySteps(classification, classification.Steps, request.Steps ?? [], tenantId);

        await db.SaveChangesAsync(ct);
        return Ok(await GetAsync(id, ct));
    }

    /// <summary>
    /// Deleting a classification takes its steps with it. The jobs that used it keep everything
    /// else and simply stop naming a classification — the SetNull on the project.
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var classification = await db.WageClassifications.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (classification is null) return NotFound();

        db.WageClassifications.Remove(classification);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// The incoming table replaces the stored one: kept rows are updated in place so their ids
    /// survive, missing ones are removed, new ones are added, and the order is the order sent.
    /// </summary>
    private void ApplySteps(
        WageClassification classification,
        List<WageClassificationStep> existing,
        IReadOnlyList<SaveWageClassificationStepRequest> incoming,
        Guid tenantId)
    {
        var kept = incoming.Where(s => s.Id is not null).Select(s => s.Id!.Value).ToHashSet();
        db.WageClassificationSteps.RemoveRange(existing.Where(s => !kept.Contains(s.Id)).ToList());

        for (var index = 0; index < incoming.Count; index++)
        {
            var source = incoming[index];
            var target = source.Id is { } stepId ? existing.FirstOrDefault(s => s.Id == stepId) : null;

            // An id we do not know is a new row, not an error: it can only come from a stale
            // panel, and losing the table would be worse.
            if (target is null)
            {
                target = new WageClassificationStep
                {
                    TenantId = tenantId,
                    ClassificationId = classification.Id,
                    Name = source.Name.Trim()
                };
                db.WageClassificationSteps.Add(target);
            }

            target.Name = source.Name.Trim();
            target.SortOrder = index;
            target.Wage = source.Wage;
            target.Cost = source.Cost;
            target.Selling = source.Selling;
            target.WageTimeAndHalf = source.WageTimeAndHalf;
            target.CostTimeAndHalf = source.CostTimeAndHalf;
            target.SellingTimeAndHalf = source.SellingTimeAndHalf;
            target.WageDouble = source.WageDouble;
            target.CostDouble = source.CostDouble;
            target.SellingDouble = source.SellingDouble;
        }
    }

    private async Task<WageClassificationDto?> GetAsync(Guid id, CancellationToken ct) =>
        await db.WageClassifications.AsNoTracking()
            .Where(c => c.Id == id)
            .Select(c => new WageClassificationDto(
                c.Id,
                c.Name,
                c.SortOrder,
                c.Projects.Count,
                c.Steps
                    .OrderBy(s => s.SortOrder)
                    .Select(s => new WageClassificationStepDto(
                        s.Id, s.Name, s.SortOrder, s.Wage, s.Cost, s.Selling,
                        s.WageTimeAndHalf, s.CostTimeAndHalf, s.SellingTimeAndHalf,
                        s.WageDouble, s.CostDouble, s.SellingDouble))
                    .ToList()))
            .FirstOrDefaultAsync(ct);

    /// <summary>Ignoring case: "Commercial" and "commercial" are one sector filed twice.</summary>
    private Task<bool> ExistsAsync(string name, Guid? exceptId, CancellationToken ct) =>
        db.WageClassifications.AsNoTracking()
            .AnyAsync(c => c.Name.ToLower() == name.ToLower() && (exceptId == null || c.Id != exceptId), ct);

    private static string? Problem(SaveWageClassificationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Le classement a besoin d'un titre.";
        if (request.Name.Trim().Length > 100) return "Le titre est trop long.";

        var steps = request.Steps ?? [];
        if (steps.Count > 50) return "Cinquante échelons, c'est plus qu'aucune grille n'en compte.";

        foreach (var step in steps)
        {
            if (string.IsNullOrWhiteSpace(step.Name)) return "Chaque échelon a besoin d'un nom.";
            if (step.Name.Trim().Length > 100) return "Le nom d'un échelon est trop long.";

            foreach (var amount in new[]
            {
                step.Wage, step.Cost, step.Selling,
                step.WageTimeAndHalf, step.CostTimeAndHalf, step.SellingTimeAndHalf,
                step.WageDouble, step.CostDouble, step.SellingDouble
            })
            {
                if (amount is < 0) return "Un taux ne peut pas être négatif.";
                if (amount is > 10_000m) return "Un taux horaire au-delà de 10 000 $, c'est sûrement une faute de frappe.";
            }
        }

        var names = steps.Select(s => s.Name.Trim().ToLowerInvariant()).ToList();
        if (names.Count != names.Distinct().Count()) return "Deux échelons portent le même nom.";

        return null;
    }
}
