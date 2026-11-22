using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Media;

[ApiController]
[Route("api/media")]
[StaffOnly]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public partial class MediaController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IR2StorageService storage) : ControllerBase
{
    private const long MaxBytes = 50L * 1024 * 1024;
    private const int MaxFileNameLength = 200;

    /// <summary>
    /// The only compression the browser is allowed to declare. It is an allow-list rather than a
    /// pass-through because the value is signed into the upload URL and then served back to
    /// readers as the object's Content-Encoding.
    /// </summary>
    private const string GzipEncoding = "gzip";

    [GeneratedRegex(@"^\.[A-Za-z0-9]{1,10}$")]
    private static partial Regex SafeExtension();

    [HttpGet]
    public async Task<ActionResult<PagedResult<MediaAssetDto>>> List([FromQuery] PagingQuery query)
    {
        var assets = db.MediaAssets.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            assets = assets.Where(m => m.FileName.Contains(query.Search));
        }

        var totalCount = await assets.CountAsync();

        var items = await assets
            .OrderByDescending(m => m.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(m => new MediaAssetDto(
                m.Id, m.FileName, m.ContentType, m.SizeBytes, m.OriginalSizeBytes, m.ContentEncoding, m.CreatedAt))
            .ToListAsync();

        return Ok(new PagedResult<MediaAssetDto>
        {
            Items = items,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalCount = totalCount
        });
    }

    [HttpPost("upload-url")]
    [RequireBusinessTenant]
    public async Task<ActionResult<CreateUploadResponse>> CreateUploadUrl(
        CreateUploadRequest request, CancellationToken ct)
    {
        var tenantId = currentUser.TenantId;
        if (tenantId is null)
        {
            return Forbid();
        }

        var fileName = CleanFileName(request.FileName);
        if (fileName is null)
        {
            return BadRequest(new { message = "Nom de fichier manquant." });
        }

        if (request.SizeBytes <= 0 || request.SizeBytes > MaxBytes)
        {
            return BadRequest(new { message = "Un fichier doit peser entre 1 octet et 50 Mo." });
        }

        var contentType = string.IsNullOrWhiteSpace(request.ContentType)
            ? "application/octet-stream"
            : request.ContentType.Trim();

        var contentEncoding = NormalizeEncoding(request.ContentEncoding);
        if (contentEncoding is null && !string.IsNullOrWhiteSpace(request.ContentEncoding))
        {
            return BadRequest(new { message = "Encodage de contenu non pris en charge." });
        }

        var extension = Path.GetExtension(fileName);
        var objectKey = SafeExtension().IsMatch(extension)
            ? $"{tenantId}/{Guid.NewGuid()}{extension.ToLowerInvariant()}"
            : $"{tenantId}/{Guid.NewGuid()}";

        try
        {
            var uploadUrl = await storage.CreateUploadUrlAsync(objectKey, contentType, contentEncoding, ct);
            return Ok(new CreateUploadResponse(objectKey, uploadUrl));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
    }

    [HttpPost("confirm")]
    [RequireBusinessTenant]
    public async Task<ActionResult<MediaAssetDto>> Confirm(ConfirmUploadRequest request)
    {
        var tenantId = currentUser.TenantId;
        if (tenantId is null)
        {
            return Forbid();
        }

        // The key is checked against this tenant's own prefix. Without this, a caller could
        // register a row pointing at another tenant's object and then read it.
        if (string.IsNullOrWhiteSpace(request.ObjectKey)
            || !request.ObjectKey.StartsWith($"{tenantId}/", StringComparison.Ordinal))
        {
            return BadRequest(new { message = "Clé d'objet invalide." });
        }

        var fileName = CleanFileName(request.FileName);
        if (fileName is null)
        {
            return BadRequest(new { message = "Nom de fichier manquant." });
        }

        if (await db.MediaAssets.AnyAsync(m => m.ObjectKey == request.ObjectKey))
        {
            return Conflict(new { message = "Ce fichier est déjà dans la bibliothèque." });
        }

        var storedSize = Math.Max(0, request.SizeBytes);

        var asset = new MediaAsset
        {
            TenantId = tenantId.Value,
            ObjectKey = request.ObjectKey,
            FileName = fileName,
            ContentType = string.IsNullOrWhiteSpace(request.ContentType)
                ? "application/octet-stream"
                : request.ContentType.Trim(),
            ContentEncoding = NormalizeEncoding(request.ContentEncoding),
            SizeBytes = storedSize,
            // Falls back to the stored size so an older client that does not send it still
            // produces a row where the two sizes agree, rather than one claiming 0 bytes saved
            // out of 0.
            OriginalSizeBytes = request.OriginalSizeBytes > 0 ? request.OriginalSizeBytes : storedSize,
            UploadedById = currentUser.UserId
        };

        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        return Ok(ToDto(asset));
    }

    [HttpGet("{id:guid}/link")]
    public async Task<ActionResult<MediaLinkDto>> Link(Guid id, CancellationToken ct)
    {
        var asset = await db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id, ct);
        if (asset is null)
        {
            return NotFound();
        }

        try
        {
            return Ok(new MediaLinkDto(await storage.CreateDownloadUrlAsync(asset.ObjectKey, asset.FileName, ct)));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
    }

    [HttpPatch("{id:guid}")]
    [RequireBusinessTenant]
    public async Task<ActionResult<MediaAssetDto>> Rename(Guid id, RenameMediaRequest request)
    {
        var asset = await db.MediaAssets.FirstOrDefaultAsync(m => m.Id == id);
        if (asset is null)
        {
            return NotFound();
        }

        var fileName = CleanFileName(request.FileName);
        if (fileName is null)
        {
            return BadRequest(new { message = "Nom de fichier manquant." });
        }

        // Only the label changes: the object keeps its key, so nothing has to move in R2.
        asset.FileName = fileName;
        await db.SaveChangesAsync();

        return Ok(ToDto(asset));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var asset = await db.MediaAssets.FirstOrDefaultAsync(m => m.Id == id, ct);
        if (asset is null)
        {
            return NotFound();
        }

        // R2 first: dropping the row while the object survives would orphan bytes nobody can reach
        // or delete afterwards.
        try
        {
            await storage.DeleteAsync(asset.ObjectKey, ct);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }

        db.MediaAssets.Remove(asset);
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    private static MediaAssetDto ToDto(MediaAsset asset) => new(
        asset.Id,
        asset.FileName,
        asset.ContentType,
        asset.SizeBytes,
        asset.OriginalSizeBytes,
        asset.ContentEncoding,
        asset.CreatedAt);

    /// <summary>
    /// Returns "gzip", or null for both "no compression" and anything unrecognised. The caller
    /// distinguishes the two cases when it needs to reject the request.
    /// </summary>
    private static string? NormalizeEncoding(string? value) =>
        string.Equals(value?.Trim(), GzipEncoding, StringComparison.OrdinalIgnoreCase)
            ? GzipEncoding
            : null;

    /// <summary>Strips any path a browser may send and keeps the result a plausible file name.</summary>
    private static string? CleanFileName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var name = Path.GetFileName(value.Trim().Replace('\\', '/'));
        name = string.Concat(name.Where(c => !Path.GetInvalidFileNameChars().Contains(c)));

        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        return name.Length > MaxFileNameLength ? name[..MaxFileNameLength] : name;
    }
}
