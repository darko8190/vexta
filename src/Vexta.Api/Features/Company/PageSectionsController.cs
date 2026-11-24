using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
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

        // Both checked against this company's own rows before anything is written. The ids
        // arrive from a browser, and a section pointing at another company's gallery would put
        // that company's photographs on this page.
        var galleryIds = incoming.Select(s => s.GalleryId).OfType<Guid>().Distinct().ToList();

        if (galleryIds.Count > 0)
        {
            var known = await db.Galleries.AsNoTracking()
                .Where(g => galleryIds.Contains(g.Id))
                .CountAsync(ct);

            if (known != galleryIds.Count) return BadRequest(new { message = "Une des galeries n'existe plus." });
        }

        var assetIds = incoming.Select(s => s.MediaAssetId).OfType<Guid>().Distinct().ToList();

        if (assetIds.Count > 0)
        {
            var known = await db.MediaAssets.AsNoTracking()
                .Where(m => assetIds.Contains(m.Id) && m.TenantId == tenantId)
                .CountAsync(ct);

            if (known != assetIds.Count) return BadRequest(new { message = "Une des photos n'existe plus dans votre bibliothèque." });
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
                target = new PublicPageSection { TenantId = tenantId, Kind = source.Kind };
                db.PublicPageSections.Add(target);
            }

            target.Kind = source.Kind;
            target.Title = Clean(source.Title);

            // Cleared when the kind no longer uses them. A gallery id left behind on a text
            // section is a setting that does nothing and will confuse whoever reads it later.
            target.Text = source.Kind == PublicPageSectionKind.Texte ? Clean(source.Text) : null;
            target.GalleryId = source.Kind == PublicPageSectionKind.Galerie ? source.GalleryId : null;
            target.MediaAssetId = source.Kind == PublicPageSectionKind.Image ? source.MediaAssetId : null;

            target.Columns = Math.Clamp(source.Columns, 1, 3);
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
            .Select(s => new
            {
                s.Id,
                s.Kind,
                s.Title,
                s.Text,
                s.GalleryId,
                GalleryName = s.Gallery == null ? null : s.Gallery.Name,
                s.MediaAssetId,
                ObjectKey = s.MediaAsset == null ? null : s.MediaAsset.ObjectKey,
                FileName = s.MediaAsset == null ? null : s.MediaAsset.FileName,
                s.Columns,
                s.IsVisible,
                s.SortOrder
            })
            .ToListAsync(ct);

        var sections = new List<PageSectionDto>(rows.Count);

        foreach (var row in rows)
        {
            string? url = null;

            if (row.ObjectKey is not null && row.FileName is not null)
            {
                try
                {
                    url = await storage.CreateDownloadUrlAsync(row.ObjectKey, row.FileName, ct);
                }
                catch (InvalidOperationException)
                {
                    // Storage is unconfigured or unreachable. The section still exists and is
                    // still arranged; it simply cannot show its photograph in the builder.
                }
            }

            sections.Add(new PageSectionDto(
                row.Id,
                row.Kind,
                row.Title,
                row.Text,
                row.GalleryId,
                row.GalleryName,
                row.MediaAssetId,
                url,
                row.Columns,
                row.IsVisible,
                row.SortOrder));
        }

        return sections;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// Refused where it can be fixed rather than skipped where nobody is looking.
    ///
    /// A section that points at nothing prints nothing, and a page with a silent hole in it is
    /// one the owner has no way of diagnosing — they arranged five bands and four appeared.
    /// </summary>
    private static string? Problem(SavePageSectionRequest section)
    {
        if (!Enum.IsDefined(section.Kind)) return "Type de section inconnu.";
        if (section.Title?.Trim().Length > 200) return "Le titre d'une section est trop long.";

        return section.Kind switch
        {
            PublicPageSectionKind.Texte when string.IsNullOrWhiteSpace(section.Text) =>
                "Une section Texte a besoin de texte.",

            PublicPageSectionKind.Texte when section.Text!.Trim().Length > 8000 =>
                "Le texte d'une section est trop long.",

            PublicPageSectionKind.Galerie when section.GalleryId is null =>
                "Choisissez la galerie à afficher.",

            PublicPageSectionKind.Image when section.MediaAssetId is null =>
                "Choisissez la photo à afficher.",

            _ => null
        };
    }
}
