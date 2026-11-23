using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Catalog;

[ApiController]
[Route("api/admin/fonctionnalites")]
[Authorize(Roles = Roles.Platform)]
public class AdminFeaturesController(VextaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<FeatureDto>>> List(CancellationToken ct)
    {
        var features = await db.Features.AsNoTracking()
            .OrderBy(f => f.SortOrder).ThenBy(f => f.Name)
            .Select(f => new FeatureDto(f.Id, f.Key, f.Name, f.Description, f.Icon, f.SortOrder,
                f.IsPublished, f.IsBuiltIn, f.Plans.Count))
            .ToListAsync(ct);

        return Ok(features);
    }

    [HttpPost]
    public async Task<ActionResult<FeatureDto>> Create(SaveFeatureRequest request, CancellationToken ct)
    {
        if (Validate(request) is { } error) return BadRequest(new { message = error });

        var key = Key(request.Key);
        if (await db.Features.AnyAsync(f => f.Key == key, ct))
        {
            return BadRequest(new { message = $"La clé « {key} » est déjà prise." });
        }

        var feature = new Feature
        {
            Key = key,
            Name = request.Name.Trim(),
            Description = request.Description.Trim(),
            Icon = request.Icon,
            SortOrder = request.SortOrder,
            IsPublished = request.IsPublished
        };

        db.Features.Add(feature);
        await db.SaveChangesAsync(ct);
        return Ok(ToDto(feature, 0));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<FeatureDto>> Update(Guid id, SaveFeatureRequest request, CancellationToken ct)
    {
        var feature = await db.Features.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (feature is null) return NotFound();

        if (Validate(request) is { } error) return BadRequest(new { message = error });

        // The name and the wording are the administrator's; the key is the application's. One
        // of the two built-in features renamed is a marketing decision, its key changed is the
        // assistant switched off for every company with no sign of why.
        if (!feature.IsBuiltIn)
        {
            var key = Key(request.Key);
            if (key != feature.Key && await db.Features.AnyAsync(f => f.Key == key, ct))
            {
                return BadRequest(new { message = $"La clé « {key} » est déjà prise." });
            }
            feature.Key = key;
        }

        feature.Name = request.Name.Trim();
        feature.Description = request.Description.Trim();
        feature.Icon = request.Icon;
        feature.SortOrder = request.SortOrder;
        feature.IsPublished = request.IsPublished;

        await db.SaveChangesAsync(ct);

        var planCount = await db.Plans.CountAsync(p => p.Features.Any(f => f.Id == feature.Id), ct);
        return Ok(ToDto(feature, planCount));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var feature = await db.Features.Include(f => f.Plans).FirstOrDefaultAsync(f => f.Id == id, ct);
        if (feature is null) return NotFound();

        if (feature.IsBuiltIn)
        {
            return BadRequest(new
            {
                message = "Cette fonctionnalité fait partie de Vexta et ne peut pas être supprimée. Retirez-la des forfaits pour la désactiver."
            });
        }

        if (feature.Plans.Count > 0)
        {
            return BadRequest(new
            {
                message = $"Cette fonctionnalité est incluse dans {feature.Plans.Count} forfait(s). Retirez-la de ces forfaits avant de la supprimer."
            });
        }

        db.Features.Remove(feature);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Lowercase, no spaces: the key is compared with <c>==</c> in a dozen places and a stray
    /// capital would make a feature that is on look off.
    /// </summary>
    private static string Key(string raw) =>
        new(raw.Trim().ToLowerInvariant().Where(c => char.IsLetterOrDigit(c) || c is '-' or '_').ToArray());

    private static string? Validate(SaveFeatureRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Le nom est obligatoire.";
        if (request.Name.Trim().Length > 60) return "Le nom ne peut pas dépasser 60 caractères.";
        if (string.IsNullOrWhiteSpace(request.Description)) return "La description est obligatoire.";
        if (request.Description.Trim().Length > 300) return "La description ne peut pas dépasser 300 caractères.";
        if (!ModuleIcons.IsAllowed(request.Icon)) return "Choisissez une icône dans la liste proposée.";
        if (Key(request.Key).Length is 0 or > 40) return "La clé doit faire entre 1 et 40 caractères.";
        return null;
    }

    private static FeatureDto ToDto(Feature f, int planCount) =>
        new(f.Id, f.Key, f.Name, f.Description, f.Icon, f.SortOrder, f.IsPublished, f.IsBuiltIn, planCount);
}
