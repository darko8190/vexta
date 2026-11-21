using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;

namespace Vexta.Api.Features.Catalog;

/// <summary>
/// The public face of the catalogue. Anonymous on purpose: the marketing site reads what the
/// super admin published instead of carrying its own copy of the prices and the feature list.
/// </summary>
[ApiController]
[Route("api")]
[AllowAnonymous]
public class CatalogController(VextaDbContext db) : ControllerBase
{
    [HttpGet("modules")]
    public async Task<ActionResult<IReadOnlyList<PublicModuleDto>>> Modules(CancellationToken ct)
    {
        var modules = await db.Modules.AsNoTracking()
            .Where(m => m.IsPublished)
            .OrderBy(m => m.SortOrder).ThenBy(m => m.Title)
            .Select(m => new PublicModuleDto(m.Id, m.Icon, m.Title, m.Description))
            .ToListAsync(ct);

        return Ok(modules);
    }

    [HttpGet("plans")]
    public async Task<ActionResult<IReadOnlyList<PublicPlanDto>>> Plans(CancellationToken ct)
    {
        // A plan with no Stripe price is never shown: a visitor must not be offered a price that
        // cannot be charged.
        var plans = await db.Plans.AsNoTracking()
            .Where(p => p.IsPublished && p.StripePriceId != null)
            .OrderBy(p => p.SortOrder).ThenBy(p => p.AmountCents)
            .Select(p => new PublicPlanDto(
                p.Id,
                p.Name,
                p.Description,
                p.AmountCents,
                p.Currency,
                p.Modules
                    .Where(m => m.IsPublished)
                    .OrderBy(m => m.SortOrder).ThenBy(m => m.Title)
                    .Select(m => new PublicModuleDto(m.Id, m.Icon, m.Title, m.Description))
                    .ToList()))
            .ToListAsync(ct);

        return Ok(plans);
    }
}
