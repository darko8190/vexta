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
/// The company's galleries: named sets of photographs it keeps to show.
///
/// Read by everyone who works there, because a foreman who photographed a finished roof is the
/// person who should be able to file it. Built and arranged by the people who run the company:
/// a gallery goes on the public page, and what the company shows the world is not a decision an
/// employee makes alone.
///
/// The files themselves are uploaded through the media routes like everything else. Nothing
/// here moves bytes; it places them.
/// </summary>
[ApiController]
[Route("api/galeries")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class GalleriesController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IR2StorageService storage) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<GalleryDto>>> List(CancellationToken ct)
    {
        var rows = await db.Galleries.AsNoTracking()
            .OrderBy(g => g.SortOrder).ThenBy(g => g.Name)
            .Select(g => new
            {
                g.Id,
                g.Name,
                g.Description,
                g.SortOrder,
                Count = g.Images.Count,
                Cover = g.Images
                    .OrderBy(i => i.SortOrder)
                    .Select(i => new { i.MediaAsset!.ObjectKey, i.MediaAsset!.FileName })
                    .FirstOrDefault(),
                g.UpdatedAt
            })
            .ToListAsync(ct);

        var items = new List<GalleryDto>(rows.Count);

        foreach (var row in rows)
        {
            items.Add(new GalleryDto(
                row.Id,
                row.Name,
                row.Description,
                row.SortOrder,
                row.Count,
                row.Cover is null ? null : await UrlOrNullAsync(row.Cover.ObjectKey, row.Cover.FileName, ct),
                row.UpdatedAt));
        }

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GalleryDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var gallery = await db.Galleries.AsNoTracking()
            .Where(g => g.Id == id)
            .Select(g => new { g.Id, g.Name, g.Description, g.SortOrder, Count = g.Images.Count, g.UpdatedAt })
            .FirstOrDefaultAsync(ct);

        if (gallery is null) return NotFound();

        var images = await ImagesOfAsync(id, ct);

        return Ok(new GalleryDetailDto(
            new GalleryDto(
                gallery.Id,
                gallery.Name,
                gallery.Description,
                gallery.SortOrder,
                gallery.Count,
                images.FirstOrDefault()?.Url,
                gallery.UpdatedAt),
            images));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<GalleryDetailDto>> Create(SaveGalleryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        if (await ExistsAsync(name, null, ct))
        {
            return Conflict(new { message = $"Une galerie s'appelle déjà « {name} »." });
        }

        var gallery = new Gallery
        {
            TenantId = tenantId,
            Name = name,
            Description = Clean(request.Description),
            SortOrder = request.SortOrder
        };

        db.Galleries.Add(gallery);
        await db.SaveChangesAsync(ct);

        return await Get(gallery.Id, ct);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<GalleryDetailDto>> Update(
        Guid id, SaveGalleryRequest request, CancellationToken ct)
    {
        var gallery = await db.Galleries.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (gallery is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        if (await ExistsAsync(name, id, ct))
        {
            return Conflict(new { message = $"Une autre galerie s'appelle déjà « {name} »." });
        }

        gallery.Name = name;
        gallery.Description = Clean(request.Description);
        gallery.SortOrder = request.SortOrder;
        gallery.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return await Get(id, ct);
    }

    /// <summary>
    /// Deletes the gallery and its placements, never the files.
    ///
    /// The photographs stay in the library: they were uploaded once and may be in a product, a
    /// posting or another gallery. A section of the public page pointing here loses its gallery
    /// and is skipped rather than deleted, so the arrangement survives the change of mind.
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var gallery = await db.Galleries.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (gallery is null) return NotFound();

        db.Galleries.Remove(gallery);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// The photographs, in the order they are to be shown. The whole list replaces the whole
    /// list, like a form's questions: reordering, captioning and removing are one save, which
    /// is what arranging a gallery actually is.
    /// </summary>
    [HttpPut("{id:guid}/images")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<GalleryDetailDto>> SaveImages(
        Guid id, SaveGalleryImagesRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var gallery = await db.Galleries.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (gallery is null) return NotFound();

        var incoming = request.Images ?? [];
        if (incoming.Count > 200) return BadRequest(new { message = "Deux cents photos dans une galerie, c'est plus que personne n'en regardera." });

        if (incoming.Any(i => i.Caption?.Trim().Length > 300))
        {
            return BadRequest(new { message = "Une légende ne peut pas dépasser 300 caractères." });
        }

        // Checked against this company's own library before anything is written. The ids arrive
        // from a browser, and a placement pointing at another company's file would put that
        // file on this company's public page.
        var wanted = incoming.Select(i => i.MediaAssetId).Distinct().ToList();

        var known = wanted.Count == 0
            ? []
            : await db.MediaAssets.AsNoTracking()
                .Where(m => wanted.Contains(m.Id) && m.TenantId == tenantId)
                .Select(m => m.Id)
                .ToListAsync(ct);

        if (known.Count != wanted.Count)
        {
            return BadRequest(new { message = "Une des photos n'existe plus dans votre bibliothèque." });
        }

        var existing = await db.GalleryImages.Where(i => i.GalleryId == id).ToListAsync(ct);

        var keptIds = incoming.Where(i => i.Id is not null).Select(i => i.Id!.Value).ToHashSet();
        db.GalleryImages.RemoveRange(existing.Where(i => !keptIds.Contains(i.Id)));

        for (var index = 0; index < incoming.Count; index++)
        {
            var source = incoming[index];
            var target = source.Id is { } imageId ? existing.FirstOrDefault(i => i.Id == imageId) : null;

            // An id we do not recognise is treated as a new placement rather than refused: it
            // can only come from a stale panel, and losing the arrangement would be worse.
            if (target is null)
            {
                target = new GalleryImage
                {
                    TenantId = tenantId,
                    GalleryId = id,
                    MediaAssetId = source.MediaAssetId
                };

                db.GalleryImages.Add(target);
            }

            target.MediaAssetId = source.MediaAssetId;
            target.Caption = Clean(source.Caption);
            target.SortOrder = index;
        }

        gallery.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return await Get(id, ct);
    }

    private async Task<List<GalleryImageDto>> ImagesOfAsync(Guid galleryId, CancellationToken ct)
    {
        var rows = await db.GalleryImages.AsNoTracking()
            .Where(i => i.GalleryId == galleryId)
            .OrderBy(i => i.SortOrder)
            .Select(i => new
            {
                i.Id,
                i.MediaAssetId,
                i.Caption,
                i.SortOrder,
                i.MediaAsset!.ObjectKey,
                i.MediaAsset!.FileName
            })
            .ToListAsync(ct);

        var images = new List<GalleryImageDto>(rows.Count);

        foreach (var row in rows)
        {
            images.Add(new GalleryImageDto(
                row.Id,
                row.MediaAssetId,
                row.FileName,
                row.Caption,
                await UrlOrNullAsync(row.ObjectKey, row.FileName, ct),
                row.SortOrder));
        }

        return images;
    }

    /// <summary>
    /// A signed link, or null when storage cannot be reached.
    ///
    /// Null rather than an exception: a bucket that is unconfigured or unreachable must not take
    /// a whole screen of galleries down with it. The grid shows the frames and says the
    /// photograph could not be loaded, which is information; a failed page is not.
    /// </summary>
    private async Task<string?> UrlOrNullAsync(string objectKey, string fileName, CancellationToken ct)
    {
        try
        {
            return await storage.CreateDownloadUrlAsync(objectKey, fileName, ct);
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    /// <summary>
    /// Whether this company already has a gallery by that name, ignoring case.
    ///
    /// Not the comparison the unique index makes — Postgres sorts by bytes, so the index would
    /// hold "Toitures" beside "toitures" without complaint. That is two places to file the same
    /// photograph and one of them forgotten, which is the thing the rule exists to prevent. The
    /// check here is the real guard and the index is what catches a race.
    /// </summary>
    private Task<bool> ExistsAsync(string name, Guid? exceptId, CancellationToken ct) =>
        db.Galleries.AsNoTracking()
            .AnyAsync(g => g.Name.ToLower() == name.ToLower() && (exceptId == null || g.Id != exceptId), ct);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? Problem(SaveGalleryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "La galerie a besoin d'un nom.";
        if (request.Name.Trim().Length > 120) return "Le nom est trop long.";
        if (request.Description?.Trim().Length > 500) return "La description est trop longue.";
        return null;
    }
}
