using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;
using Vexta.Api.Services;

// Stripe.net also has a Plan (its deprecated billing type); ours is the one meant everywhere here.
using Plan = Vexta.Api.Domain.Plan;

namespace Vexta.Api.Features.Catalog;

[ApiController]
[Route("api/admin/plans")]
[Authorize(Roles = Roles.Platform)]
public class AdminPlansController(VextaDbContext db, IStripeService stripe) : ControllerBase
{
    private const long MinCents = 100;
    private const long MaxCents = 10_000_000;
    private const int MaxSeats = 500;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PlanDto>>> List(CancellationToken ct)
    {
        var plans = await db.Plans.AsNoTracking()
            .Include(p => p.Modules)
            .Include(p => p.Features)
            .OrderBy(p => p.SortOrder).ThenBy(p => p.AmountCents)
            .ToListAsync(ct);

        var tenantCounts = await db.Tenants.AsNoTracking()
            .Where(t => t.PlanId != null)
            .GroupBy(t => t.PlanId!.Value)
            .Select(g => new { PlanId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.PlanId, x => x.Count, ct);

        return Ok(plans.Select(p => ToDto(p, tenantCounts.GetValueOrDefault(p.Id))).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<PlanDto>> Create(SavePlanRequest request, CancellationToken ct)
    {
        if (Validate(request) is { } error)
        {
            return BadRequest(new { message = error });
        }

        var plan = new Plan
        {
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            AmountCents = request.AmountCents,
            MinUsers = request.MinUsers,
            MaxUsers = request.MaxUsers,
            MonthlyReceiptScans = request.MonthlyReceiptScans,
            SortOrder = request.SortOrder
        };

        plan.Modules = await LoadModulesAsync(request.ModuleIds, ct);
        plan.Features = await LoadFeaturesAsync(request.FeatureIds, ct) ?? [];

        var priceError = await AttachPriceAsync(plan, ct);
        if (priceError is not null && request.IsPublished)
        {
            return BadRequest(new { message = priceError });
        }

        plan.IsPublished = request.IsPublished && plan.StripePriceId is not null;

        db.Plans.Add(plan);
        await db.SaveChangesAsync(ct);

        return Ok(ToDto(plan, 0));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PlanDto>> Update(Guid id, SavePlanRequest request, CancellationToken ct)
    {
        var plan = await db.Plans
            .Include(p => p.Modules)
            .Include(p => p.Features)
            .FirstOrDefaultAsync(p => p.Id == id, ct);
        if (plan is null)
        {
            return NotFound();
        }

        if (Validate(request) is { } error)
        {
            return BadRequest(new { message = error });
        }

        plan.Name = request.Name.Trim();
        plan.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        plan.SortOrder = request.SortOrder;
        plan.MinUsers = request.MinUsers;
        plan.MaxUsers = request.MaxUsers;
        plan.MonthlyReceiptScans = request.MonthlyReceiptScans;
        plan.Modules = await LoadModulesAsync(request.ModuleIds, ct);
        if (await LoadFeaturesAsync(request.FeatureIds, ct) is { } features) plan.Features = features;
        plan.UpdatedAt = DateTimeOffset.UtcNow;

        // A new amount means a new Stripe price: prices are immutable. Tenants already subscribed
        // keep paying the old one until they are migrated in Stripe.
        var amountChanged = plan.AmountCents != request.AmountCents;
        if (amountChanged)
        {
            plan.AmountCents = request.AmountCents;
            plan.StripePriceId = null;
        }

        string? priceError = null;
        if (plan.StripePriceId is null)
        {
            priceError = await AttachPriceAsync(plan, ct);
        }

        if (priceError is not null && request.IsPublished)
        {
            return BadRequest(new { message = priceError });
        }

        plan.IsPublished = request.IsPublished && plan.StripePriceId is not null;

        await db.SaveChangesAsync(ct);

        var tenantCount = await db.Tenants.CountAsync(t => t.PlanId == plan.Id, ct);
        return Ok(ToDto(plan, tenantCount));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var plan = await db.Plans.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (plan is null)
        {
            return NotFound();
        }

        var tenantCount = await db.Tenants.CountAsync(t => t.PlanId == plan.Id, ct);
        if (tenantCount > 0)
        {
            return BadRequest(new
            {
                message = $"{tenantCount} locataire(s) sont sur ce forfait. Dépubliez-le plutôt que de le supprimer."
            });
        }

        db.Plans.Remove(plan);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Gives the plan a Stripe price, or explains why it has none. A missing price is not fatal
    /// while the plan stays unpublished — it lets the catalogue be built before Stripe is wired up.
    /// </summary>
    private async Task<string?> AttachPriceAsync(Plan plan, CancellationToken ct)
    {
        try
        {
            plan.StripePriceId = await stripe.CreateRecurringPriceAsync(plan.AmountCents, ct);
            return null;
        }
        catch (InvalidOperationException ex)
        {
            return ex.Message;
        }
        catch (StripeException ex)
        {
            return $"Stripe a refusé la création du tarif : {ex.StripeError?.Message ?? ex.Message}";
        }
    }

    private async Task<List<Module>> LoadModulesAsync(IReadOnlyList<Guid> moduleIds, CancellationToken ct)
    {
        if (moduleIds.Count == 0)
        {
            return [];
        }

        var ids = moduleIds.Distinct().ToList();
        return await db.Modules.Where(m => ids.Contains(m.Id)).ToListAsync(ct);
    }

    /// <summary>
    /// Null when the caller said nothing about features, which is not the same as an empty
    /// list: one leaves the plan as it is, the other takes everything off it.
    /// </summary>
    private async Task<List<Feature>?> LoadFeaturesAsync(IReadOnlyList<Guid>? featureIds, CancellationToken ct)
    {
        if (featureIds is null) return null;
        if (featureIds.Count == 0) return [];

        var ids = featureIds.Distinct().ToList();
        return await db.Features.Where(f => ids.Contains(f.Id)).ToListAsync(ct);
    }

    private static string? Validate(SavePlanRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Le nom du forfait est obligatoire.";
        if (request.Name.Trim().Length > 60) return "Le nom ne peut pas dépasser 60 caractères.";
        if (request.Description is { Length: > 300 }) return "La description ne peut pas dépasser 300 caractères.";
        if (request.AmountCents < MinCents || request.AmountCents > MaxCents)
            return "Le tarif mensuel doit être entre 1 $ et 100 000 $.";
        // Zero would be a plan nobody can sign into, including the person who paid for it.
        if (request.MinUsers < 1 || request.MinUsers > MaxSeats)
            return $"Le minimum d'utilisateurs doit être entre 1 et {MaxSeats}.";
        if (request.MaxUsers < 1 || request.MaxUsers > MaxSeats)
            return $"Le maximum d'utilisateurs doit être entre 1 et {MaxSeats}.";
        if (request.MinUsers > request.MaxUsers)
            return "Le minimum d'utilisateurs ne peut pas dépasser le maximum.";
        // A ceiling, because this is the one thing that bills per use: a typo of 100000 here is
        // a month's worth of somebody else's money.
        if (request.MonthlyReceiptScans is < 0 or > 10_000)
            return "Les lectures de reçus par mois doivent être entre 0 et 10 000.";
        return null;
    }

    private static PlanDto ToDto(Plan p, int tenantCount) =>
        new(p.Id,
            p.Name,
            p.Description,
            p.AmountCents,
            p.Currency,
            p.MinUsers,
            p.MaxUsers,
            p.MonthlyReceiptScans,
            p.IsPublished,
            p.SortOrder,
            p.StripePriceId,
            p.Modules
                .OrderBy(m => m.SortOrder).ThenBy(m => m.Title)
                .Select(m => new ModuleDto(m.Id, m.Icon, m.Title, m.Description, m.SortOrder, m.IsPublished,
                    m.NavHref, m.ParentModuleId, m.OwnerOnly))
                .ToList(),
            p.Features
                .OrderBy(f => f.SortOrder).ThenBy(f => f.Name)
                .Select(f => new FeatureDto(f.Id, f.Key, f.Name, f.Description, f.Icon, f.SortOrder,
                    f.IsPublished, f.IsBuiltIn, 0))
                .ToList(),
            tenantCount);
}
