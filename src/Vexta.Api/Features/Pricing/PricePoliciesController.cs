using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;

// Named after the policies and not after the folder on purpose: a namespace called
// Features.Pricing shadows Common.Pricing inside every other Features.* file, which is where
// the margin formulas are called from.
namespace Vexta.Api.Features.PricePolicies;

/// <summary>
/// The company's named margins.
///
/// Readable by the whole team, because the invoice form and the project form both offer the
/// list; only the owner changes it, the same rule the billing settings already follow — a
/// margin is what the company charges, not a per-user preference.
/// </summary>
[ApiController]
[Route("api/price-policies")]
[StaffOnly]
[RequireActiveSubscription]
public class PricePoliciesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{


    [HttpGet]
    [Authorize(Roles = Roles.Staff)]
    public async Task<ActionResult<List<PricePolicyDto>>> List(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var policies = await db.PricePolicies.AsNoTracking()
            .Include(p => p.Tiers)
            .OrderBy(p => p.Name)
            .ToListAsync(ct);
        var defaultId = await DefaultIdAsync(tenantId, policies, ct);

        return Ok(policies.Select(p => ToDto(p, defaultId)).ToList());
    }

    [HttpPost]
    [Authorize(Roles = Roles.Owner)]
    [RequireBusinessTenant]
    public async Task<ActionResult<PricePolicyDto>> Create(SavePricePolicyRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var name = Clean(request.Name);
        if (await ProblemAsync(name, request, null, tenantId, ct) is { } problem)
        {
            return BadRequest(new { message = problem });
        }

        var policy = new PricePolicy
        {
            TenantId = tenantId,
            Name = name!,
            MarginPercent = request.MarginPercent,
            Description = Clean(request.Description),
            IsDefault = request.IsDefault
        };

        policy.Tiers.AddRange(TiersOf(request, tenantId, policy.Id));

        db.PricePolicies.Add(policy);

        // Done before the new row exists, so it only touches the policies already saved.
        if (request.IsDefault) await ApplyDefaultAsync(tenantId, policy.Id, ct);

        await db.SaveChangesAsync(ct);

        return Ok(ToDto(policy, request.IsDefault ? policy.Id : await DefaultIdAsync(tenantId, null, ct)));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<ActionResult<PricePolicyDto>> Update(
        Guid id, SavePricePolicyRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var policy = await db.PricePolicies.Include(p => p.Tiers).FirstOrDefaultAsync(p => p.Id == id, ct);
        if (policy is null) return NotFound();

        var name = Clean(request.Name);
        if (await ProblemAsync(name, request, id, tenantId, ct) is { } problem)
        {
            return BadRequest(new { message = problem });
        }

        policy.Name = name!;
        policy.MarginPercent = request.MarginPercent;
        policy.Description = Clean(request.Description);
        policy.UpdatedAt = DateTimeOffset.UtcNow;

        // Replaced wholesale rather than matched up row by row. A band has no identity of its
        // own — it is a line in a table that is read top to bottom — and matching on ids would
        // mean deciding whether a moved ceiling is the same band edited or a different one.
        //
        // Added through the set, not through the navigation. A tier arrives with its Guid key
        // already filled in, and EF reads a non-default key on an entity it has never seen as
        // "this row exists" — so attaching it to the collection produced an UPDATE of a row
        // that had just been deleted, and the save died on zero rows affected.
        //
        // Nothing is put back into policy.Tiers afterwards either: EF fixes the collection up
        // from the foreign key, so adding them again by hand returned every band twice in the
        // answer while the table itself was right.
        var tiers = TiersOf(request, policy.TenantId, policy.Id);

        db.PricePolicyTiers.RemoveRange(policy.Tiers);
        policy.Tiers.Clear();
        db.PricePolicyTiers.AddRange(tiers);

        var wasDefault = await DefaultIdAsync(tenantId, null, ct) == id;

        // Unticking the box on the policy that holds the default leaves the company with none,
        // which is a decision it is allowed to make: a project then names its own policy or
        // prices from the product's own margin.
        if (request.IsDefault) await ApplyDefaultAsync(tenantId, id, ct);
        else if (wasDefault) await ApplyDefaultAsync(tenantId, null, ct);

        await db.SaveChangesAsync(ct);

        return Ok(ToDto(policy, await DefaultIdAsync(tenantId, null, ct)));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var policy = await db.PricePolicies.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (policy is null) return NotFound();

        // Refused with the count rather than cascading: a project or an invoice that loses its
        // policy loses the one field that says why its lines are priced the way they are, and
        // nobody can tell afterwards which one it used to be.
        var projects = await db.Projects.CountAsync(p => p.PricePolicyId == id, ct);
        var invoices = await db.Invoices.CountAsync(i => i.PricePolicyId == id, ct);

        if (projects + invoices > 0)
        {
            return Conflict(new { message = InUseMessage(projects, invoices) });
        }

        if (await DefaultIdAsync(tenantId, null, ct) == id)
        {
            await ApplyDefaultAsync(tenantId, null, ct);
        }

        db.PricePolicies.Remove(policy);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Writes the default in one place and mirrors it onto the rows, so the flag a list reads
    /// and the id a project reads can never say different things.
    /// </summary>
    private async Task ApplyDefaultAsync(Guid tenantId, Guid? defaultId, CancellationToken ct)
    {
        var policies = await db.PricePolicies.ToListAsync(ct);

        foreach (var policy in policies)
        {
            var now = defaultId is { } chosen && policy.Id == chosen;
            if (policy.IsDefault == now) continue;

            policy.IsDefault = now;
            policy.UpdatedAt = DateTimeOffset.UtcNow;
        }

        // Only when the company has already been through the billing settings. Creating that
        // row here would tell the invoice endpoints it has settled its taxes and its numbering,
        // which choosing a default margin is not.
        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
        if (settings is null) return;

        settings.DefaultPricePolicyId = defaultId;
        settings.UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// The settings are the authority. Before the company has saved them once there is no row
    /// to hold the id, and the flag on the policies stands in for it.
    /// </summary>
    private async Task<Guid?> DefaultIdAsync(Guid tenantId, List<PricePolicy>? known, CancellationToken ct)
    {
        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);

        if (settings is not null) return settings.DefaultPricePolicyId;

        if (known is not null) return known.FirstOrDefault(p => p.IsDefault)?.Id;

        return await db.PricePolicies.AsNoTracking()
            .Where(p => p.IsDefault)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<string?> ProblemAsync(
        string? name, SavePricePolicyRequest request, Guid? id, Guid tenantId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Le nom de la politique est obligatoire.";
        if (name.Length > 100) return "Le nom ne peut pas dépasser 100 caractères.";
        if (request.Description?.Trim().Length > 500) return "La description ne peut pas dépasser 500 caractères.";
        if (request.MarginPercent is < 0 or >= 1000) return "La marge doit être entre 0 et 999 %.";

        // Vendant = achat ÷ (1 − marge / 100) cannot be computed at 100 %: it would mean handing
        // the goods over and charging infinity. Only the Division convention has that ceiling.
        var mode = await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == tenantId)
            .Select(b => b.MarginMode)
            .FirstOrDefaultAsync(ct);

        if (mode == MarginMode.Division && request.MarginPercent >= 100m)
        {
            return "En mode Division, la marge doit rester sous 100 %.";
        }

        if (TiersProblem(request, mode) is { } tiersProblem) return tiersProblem;

        var lowered = name.ToLower();
        if (await db.PricePolicies.AnyAsync(p => p.Id != id && p.Name.ToLower() == lowered, ct))
        {
            return "Une politique porte déjà ce nom.";
        }

        return null;
    }

    private static string InUseMessage(int projects, int invoices)
    {
        if (projects > 0 && invoices > 0)
        {
            return $"{Count(projects, "projet")} et {Count(invoices, "facture")} utilisent cette politique. "
                + "Changez-les d'abord.";
        }

        if (projects > 0)
        {
            return projects == 1
                ? "Un projet utilise cette politique. Changez-le d'abord."
                : $"{projects} projets utilisent cette politique. Changez-les d'abord.";
        }

        return invoices == 1
            ? "Une facture utilise cette politique. Changez-la d'abord."
            : $"{invoices} factures utilisent cette politique. Changez-les d'abord.";
    }

    private static string Count(int value, string noun) =>
        value == 1 ? $"1 {noun}" : $"{value} {noun}s";

    /// <summary>
    /// What the bands have to satisfy to be readable as a table.
    ///
    /// Gaps are allowed: a company can price 0–5 $ and 50 $ and up, and leave everything between
    /// at the policy's flat margin. Overlaps are not — two bands covering 4 $ means the price of
    /// a 4 $ item depends on which row happens to be read first, and the answer would change the
    /// day somebody renames a policy.
    /// </summary>
    private static string? TiersProblem(SavePricePolicyRequest request, MarginMode mode)
    {
        var tiers = request.Tiers;
        if (tiers is null || tiers.Count == 0) return null;

        if (tiers.Count > 20) return "Vingt paliers au maximum.";

        var ordered = tiers.OrderBy(t => t.FromAmount).ToList();

        for (var i = 0; i < ordered.Count; i++)
        {
            var tier = ordered[i];

            if (tier.FromAmount < 0) return "Un palier ne peut pas commencer sous zéro.";
            if (tier.ToAmount is { } to && to < tier.FromAmount)
            {
                return "La fin d'un palier ne peut pas précéder son début.";
            }

            if (tier.MarginPercent is < 0 or >= 1000) return "La marge d'un palier doit être entre 0 et 999 %.";
            if (mode == MarginMode.Division && tier.MarginPercent >= 100m)
            {
                return "En mode Division, la marge d'un palier doit rester sous 100 %.";
            }

            if (i == ordered.Count - 1) continue;

            // Only the last band may be open-ended: one in the middle would swallow every band
            // above it, and the table would stop meaning what it says.
            if (tier.ToAmount is not { } ceiling)
            {
                return "Seul le dernier palier peut rester ouvert vers le haut.";
            }

            if (ordered[i + 1].FromAmount <= ceiling)
            {
                return "Deux paliers se chevauchent. Faites commencer le suivant au-dessus du précédent.";
            }
        }

        return null;
    }

    private static List<PricePolicyTier> TiersOf(
        SavePricePolicyRequest request, Guid tenantId, Guid policyId) =>
        (request.Tiers ?? [])
            .OrderBy(t => t.FromAmount)
            .Select(t => new PricePolicyTier
            {
                TenantId = tenantId,
                PricePolicyId = policyId,
                FromAmount = t.FromAmount,
                ToAmount = t.ToAmount,
                MarginPercent = t.MarginPercent
            })
            .ToList();

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static PricePolicyDto ToDto(PricePolicy policy, Guid? defaultId) =>
        new(policy.Id,
            policy.Name,
            policy.MarginPercent,
            policy.Description,
            defaultId == policy.Id,
            policy.Tiers
                .OrderBy(t => t.FromAmount)
                .Select(t => new PricePolicyTierDto(t.FromAmount, t.ToAmount, t.MarginPercent))
                .ToList(),
            policy.CreatedAt,
            policy.UpdatedAt);
}
