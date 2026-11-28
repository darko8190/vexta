using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Public;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Company;

/// <summary>
/// How the company arranges its own public page.
///
/// The owner's, like the rest of the page: this is the face the business shows the world, and
/// an employee rearranging it is not a decision the employee should be making.
///
/// What is arranged is only the middle. The head of the page — the colour, the logo, the name,
/// the accroche — and its foot — the address, the telephone, the courriel — are fixed, because
/// they are the two things every visitor is actually looking for and a company that could hide
/// them would.
///
/// Each band is a row of one to twelve columns, and each column says what it shows. On a
/// telephone the columns stack.
///
/// A company with no sections still has a page: the arrangement the application has always
/// drawn, in the order it has always drawn it. That fallback lives in the web app, and it is
/// what makes this safe to ship — nobody's page changes until they decide to build one.
/// </summary>
[ApiController]
[Route("api/company/sections")]
[StaffOnly]
[Authorize(Roles = Roles.Owner)]
[RequireActiveSubscription]
public class PageSectionsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IR2StorageService storage) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<PageSectionDto>>> List(CancellationToken ct) =>
        Ok(await SectionsAsync(ct));

    /// <summary>
    /// Everything the builder needs to draw the page as it is being edited: the page a visitor
    /// would read, every gallery's photographs, and the forms that can go in a column. Drawn
    /// even while the page is unpublished — that is when it is being built.
    /// </summary>
    [HttpGet("preview")]
    public async Task<ActionResult<PagePreviewDto>> Preview(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var page = await db.PublicPages.AsNoTracking().FirstOrDefaultAsync(ct)
            ?? new PublicPage { TenantId = tenantId };

        var content = new PublicPageContent(db, storage);
        var company = await content.CompanyAsync(tenantId, page, [], ct);
        if (company is null) return NotFound();

        var galleries = await content.GalleryImagesAsync(tenantId, null, ct);

        var forms = await db.FormTemplates.AsNoTracking()
            .Where(f => f.IsPublished)
            .OrderBy(f => f.Title)
            .Select(f => new PageFormChoiceDto(f.Id, f.Title, f.Description, f.Kind))
            .ToListAsync(ct);

        return Ok(new PagePreviewDto(company, galleries, forms, page.ShowProducts, page.ShowJobs, page.ShowForms));
    }

    [HttpPut]
    [RequireBusinessTenant]
    public async Task<ActionResult<List<PageSectionDto>>> Save(
        SavePageSectionsRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var incoming = request.Sections ?? [];
        if (incoming.Count > 40) return BadRequest(new { message = "Quarante sections, c'est une page que personne ne lira jusqu'au bout." });

        foreach (var section in incoming)
        {
            if (Problem(section) is { } problem) return BadRequest(new { message = problem });
        }

        var cells = incoming.SelectMany(s => s.Cells ?? []).ToList();

        // Every id checked against this company's own rows before anything is written. They
        // arrive from a browser, and a column pointing at another company's gallery would put
        // that company's photographs on this page.
        var galleryIds = cells.Select(c => c.GalleryId).OfType<Guid>().Distinct().ToList();
        if (galleryIds.Count > 0
            && await db.Galleries.AsNoTracking().CountAsync(g => galleryIds.Contains(g.Id), ct) != galleryIds.Count)
        {
            return BadRequest(new { message = "Une des galeries n'existe plus." });
        }

        var assetIds = cells.Select(c => c.MediaAssetId).OfType<Guid>().Distinct().ToList();
        if (assetIds.Count > 0
            && await db.MediaAssets.AsNoTracking().CountAsync(m => assetIds.Contains(m.Id) && m.TenantId == tenantId, ct) != assetIds.Count)
        {
            return BadRequest(new { message = "Une des photos n'existe plus dans votre bibliothèque." });
        }

        var formIds = cells.Select(c => c.FormTemplateId).OfType<Guid>().Distinct().ToList();
        if (formIds.Count > 0
            && await db.FormTemplates.AsNoTracking().CountAsync(f => formIds.Contains(f.Id), ct) != formIds.Count)
        {
            return BadRequest(new { message = "Un des formulaires n'existe plus." });
        }

        var existing = await db.PublicPageSections.ToListAsync(ct);

        var keptIds = incoming.Where(s => s.Id is not null).Select(s => s.Id!.Value).ToHashSet();
        db.PublicPageSections.RemoveRange(existing.Where(s => !keptIds.Contains(s.Id)));

        var now = DateTimeOffset.UtcNow;

        for (var index = 0; index < incoming.Count; index++)
        {
            var source = incoming[index];
            var target = source.Id is { } sectionId ? existing.FirstOrDefault(s => s.Id == sectionId) : null;

            // An id we do not recognise is treated as a new section rather than refused: it can
            // only come from a stale panel, and losing the arrangement would be the worse answer.
            if (target is null)
            {
                target = new PublicPageSection { TenantId = tenantId };
                db.PublicPageSections.Add(target);
            }

            // Cleared when the kind no longer uses them. A gallery id left behind on a text
            // column is a setting that does nothing and will confuse whoever reads it later.
            var saved = (source.Cells ?? []).Select(c => new PageCell
            {
                Kind = c.Kind,
                Title = Clean(c.Title),
                Text = c.Kind == PublicPageSectionKind.Texte ? Clean(c.Text) : null,
                GalleryId = c.Kind == PublicPageSectionKind.Galerie ? c.GalleryId : null,
                MediaAssetId = c.Kind == PublicPageSectionKind.Image ? c.MediaAssetId : null,
                FormTemplateId = c.Kind == PublicPageSectionKind.Formulaire ? c.FormTemplateId : null,
                ItemsPerRow = Math.Clamp(c.ItemsPerRow, 1, 6),
                Shape = Enum.IsDefined(c.Shape) ? c.Shape : PageItemShape.Rectangle
            }).ToList();

            target.Title = Clean(source.Title);
            target.CellsJson = PageCells.Write(saved);
            target.FormTemplateIds = saved.Select(c => c.FormTemplateId).OfType<Guid>().Distinct().ToList();
            target.Background = Enum.IsDefined(source.Background) ? source.Background : PageSectionBackground.Aucun;
            target.IsVisible = source.IsVisible;
            target.SortOrder = index;
            target.UpdatedAt = now;
        }

        await db.SaveChangesAsync(ct);
        return Ok(await SectionsAsync(ct));
    }

    private async Task<List<PageSectionDto>> SectionsAsync(CancellationToken ct)
    {
        var rows = await db.PublicPageSections.AsNoTracking()
            .OrderBy(s => s.SortOrder)
            .Select(s => new { s.Id, s.Title, s.Background, s.CellsJson, s.IsVisible, s.SortOrder })
            .ToListAsync(ct);

        var parsed = rows.Select(r => (Row: r, Cells: PageCells.Read(r.CellsJson))).ToList();
        var all = parsed.SelectMany(p => p.Cells).ToList();

        var galleryIds = all.Select(c => c.GalleryId).OfType<Guid>().Distinct().ToList();
        var galleryNames = galleryIds.Count == 0
            ? []
            : await db.Galleries.AsNoTracking()
                .Where(g => galleryIds.Contains(g.Id))
                .ToDictionaryAsync(g => g.Id, g => g.Name, ct);

        var assetIds = all.Select(c => c.MediaAssetId).OfType<Guid>().Distinct().ToList();
        var assets = assetIds.Count == 0
            ? []
            : await db.MediaAssets.AsNoTracking()
                .Where(m => assetIds.Contains(m.Id))
                .Select(m => new { m.Id, m.ObjectKey, m.FileName })
                .ToListAsync(ct);

        var content = new PublicPageContent(db, storage);
        var urls = new Dictionary<Guid, string?>();
        foreach (var asset in assets) urls[asset.Id] = await content.UrlOrNullAsync(asset.ObjectKey, asset.FileName, ct);

        return parsed.Select(p => new PageSectionDto(
            p.Row.Id,
            p.Row.Title,
            p.Row.Background,
            p.Cells.Select(c => new PageCellDto(
                c.Kind,
                c.Title,
                c.Text,
                c.GalleryId is { } g && galleryNames.ContainsKey(g) ? g : null,
                c.GalleryId is { } n ? galleryNames.GetValueOrDefault(n) : null,
                c.MediaAssetId is { } m && urls.ContainsKey(m) ? m : null,
                c.MediaAssetId is { } u ? urls.GetValueOrDefault(u) : null,
                c.FormTemplateId,
                c.ItemsPerRow,
                c.Shape)).ToList(),
            p.Row.IsVisible,
            p.Row.SortOrder)).ToList();
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// Refused where it can be fixed rather than skipped where nobody is looking: a column that
    /// points at nothing prints nothing, and a page with a silent hole in it is one the owner
    /// has no way of diagnosing.
    /// </summary>
    private static string? Problem(SavePageSectionRequest section)
    {
        if (section.Title?.Trim().Length > 200) return "Le titre d'une section est trop long.";

        var cells = section.Cells ?? [];
        if (cells.Count is < 1 or > 12) return "Une section a de une à douze colonnes.";

        foreach (var cell in cells)
        {
            if (!Enum.IsDefined(cell.Kind)) return "Type de contenu inconnu.";
            if (cell.Title?.Trim().Length > 200) return "Le titre d'une colonne est trop long.";

            var problem = cell.Kind switch
            {
                // An empty text column is allowed: in a row of several it is the space between.
                PublicPageSectionKind.Texte when cell.Text?.Trim().Length > 8000 =>
                    "Le texte d'une colonne est trop long.",
                PublicPageSectionKind.Galerie when cell.GalleryId is null =>
                    "Choisissez la galerie à afficher.",
                PublicPageSectionKind.Image when cell.MediaAssetId is null =>
                    "Choisissez la photo à afficher.",
                PublicPageSectionKind.Formulaire when cell.FormTemplateId is null =>
                    "Choisissez le formulaire à afficher.",
                _ => null
            };

            if (problem is not null) return problem;
        }

        return null;
    }
}

/// <summary>What the builder draws its live page from.</summary>
public record PagePreviewDto(
    PublicCompanyDto Company,
    Dictionary<Guid, List<PublicGalleryImageDto>> Galleries,
    List<PageFormChoiceDto> Forms,
    bool ShowProducts,
    bool ShowJobs,
    bool ShowForms);
