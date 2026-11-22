using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Catalog;

[ApiController]
[Route("api/admin/modules")]
[Authorize(Roles = Roles.Platform)]
public class AdminModulesController(VextaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ModuleDto>>> List(CancellationToken ct)
    {
        var modules = await db.Modules.AsNoTracking()
            .OrderBy(m => m.SortOrder).ThenBy(m => m.Title)
            .Select(m => new ModuleDto(m.Id, m.Icon, m.Title, m.Description, m.SortOrder, m.IsPublished,
                m.NavHref, m.ParentModuleId, m.OwnerOnly))
            .ToListAsync(ct);

        return Ok(modules);
    }

    /// <summary>The icon names the web app can draw, so the form offers exactly those.</summary>
    [HttpGet("icons")]
    public ActionResult<IReadOnlyList<string>> Icons() => Ok(ModuleIcons.Allowed.OrderBy(i => i).ToList());

    [HttpPost]
    public async Task<ActionResult<ModuleDto>> Create(SaveModuleRequest request, CancellationToken ct)
    {
        if (Validate(request) is { } error)
        {
            return BadRequest(new { message = error });
        }

        var module = new Module
        {
            Icon = request.Icon,
            Title = request.Title.Trim(),
            Description = request.Description.Trim(),
            SortOrder = request.SortOrder,
            IsPublished = request.IsPublished,
            NavHref = CleanHref(request.NavHref),
            ParentModuleId = request.ParentModuleId,
            OwnerOnly = request.OwnerOnly
        };

        db.Modules.Add(module);
        await db.SaveChangesAsync(ct);

        return Ok(ToDto(module));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ModuleDto>> Update(Guid id, SaveModuleRequest request, CancellationToken ct)
    {
        var module = await db.Modules.FirstOrDefaultAsync(m => m.Id == id, ct);
        if (module is null)
        {
            return NotFound();
        }

        if (Validate(request) is { } error)
        {
            return BadRequest(new { message = error });
        }

        module.Icon = request.Icon;
        module.Title = request.Title.Trim();
        module.Description = request.Description.Trim();
        module.SortOrder = request.SortOrder;
        module.IsPublished = request.IsPublished;
        module.NavHref = CleanHref(request.NavHref);
        module.ParentModuleId = request.ParentModuleId == id ? null : request.ParentModuleId;
        module.OwnerOnly = request.OwnerOnly;

        await db.SaveChangesAsync(ct);
        return Ok(ToDto(module));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var module = await db.Modules.Include(m => m.Plans).FirstOrDefaultAsync(m => m.Id == id, ct);
        if (module is null)
        {
            return NotFound();
        }

        // Deleting it would silently shorten the inclusion list of every plan that names it, so
        // the plans have to be untied first, deliberately.
        if (module.Plans.Count > 0)
        {
            return BadRequest(new
            {
                message = $"Ce module est inclus dans {module.Plans.Count} forfait(s). Retirez-le de ces forfaits avant de le supprimer."
            });
        }

        db.Modules.Remove(module);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Validate(SaveModuleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title)) return "Le titre est obligatoire.";
        if (request.Title.Trim().Length > 60) return "Le titre ne peut pas dépasser 60 caractères.";
        if (string.IsNullOrWhiteSpace(request.Description)) return "La description est obligatoire.";
        if (request.Description.Trim().Length > 300) return "La description ne peut pas dépasser 300 caractères.";
        if (!ModuleIcons.IsAllowed(request.Icon)) return "Choisissez une icône dans la liste proposée.";

        var href = CleanHref(request.NavHref);
        if (href is not null)
        {
            // Relative and internal only. An absolute URL in a sidebar is how a tenant menu
            // becomes somebody else's landing page.
            if (!href.StartsWith('/') || href.StartsWith("//")) return "Le lien doit commencer par / et rester interne.";
            if (href.Length > 100) return "Le lien ne peut pas dépasser 100 caractères.";
        }

        return null;
    }

    private static string? CleanHref(string? href) =>
        string.IsNullOrWhiteSpace(href) ? null : href.Trim();

    private static ModuleDto ToDto(Module m) =>
        new(m.Id, m.Icon, m.Title, m.Description, m.SortOrder, m.IsPublished,
            m.NavHref, m.ParentModuleId, m.OwnerOnly);
}
