using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Catalog;

/// <summary>One sidebar entry, with the entries nested under it.</summary>
public record NavigationItemDto(Guid Id, string Icon, string Title, string Href, IReadOnlyList<NavigationItemDto> Children);

[ApiController]
[Route("api/navigation")]
public class NavigationController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>
    /// The sidebar of the company this token is scoped to, built from the modules its plan
    /// includes.
    ///
    /// An empty answer is not an empty sidebar: it means this company's plan defines none, and
    /// the web app falls back to the built-in menu. That matters because a company with no plan
    /// — every tenant created by hand — would otherwise be left with no way to reach anything.
    /// </summary>
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<IReadOnlyList<NavigationItemDto>>> Get(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Ok(Array.Empty<NavigationItemDto>());

        // A customer sees their own files through a fixed menu, and a personal space has no plan
        // to read. Neither is driven by modules.
        if (currentUser.Role == UserRole.Client) return Ok(Array.Empty<NavigationItemDto>());

        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => new { t.Kind, t.PlanId })
            .FirstOrDefaultAsync(ct);

        if (tenant?.PlanId is not { } planId || tenant.Kind == TenantKind.Personal)
        {
            return Ok(Array.Empty<NavigationItemDto>());
        }

        var modules = await db.Modules.AsNoTracking()
            .Where(m => m.IsPublished && m.NavHref != null && m.Plans.Any(p => p.Id == planId))
            .OrderBy(m => m.SortOrder).ThenBy(m => m.Title)
            .Select(m => new { m.Id, m.Icon, m.Title, m.NavHref, m.ParentModuleId, m.OwnerOnly })
            .ToListAsync(ct);

        // A super admin inside a tenant acts as its owner, the same rule the rest of the
        // application follows.
        var isOwner = currentUser.Role == UserRole.TenantAdmin || currentUser.IsImpersonating;
        var visible = modules.Where(m => isOwner || !m.OwnerOnly).ToList();

        var childrenOf = visible
            .Where(m => m.ParentModuleId is not null)
            .GroupBy(m => m.ParentModuleId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var items = visible
            .Where(m => m.ParentModuleId is null)
            .Select(m => new NavigationItemDto(
                m.Id, m.Icon, m.Title, m.NavHref!,
                childrenOf.TryGetValue(m.Id, out var children)
                    ? children.Select(c => new NavigationItemDto(c.Id, c.Icon, c.Title, c.NavHref!, [])).ToList()
                    : []))
            .ToList();

        return Ok(items);
    }
}
