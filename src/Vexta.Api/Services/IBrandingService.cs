using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>What the front end needs to know about one slot without downloading the image.</summary>
public record BrandingSlotInfo(string Slot, bool IsUploaded, string? ETag, int Width, int Height);

public interface IBrandingService
{
    Task<BrandingAsset?> GetAsync(string slot, CancellationToken ct = default);

    Task<IReadOnlyList<BrandingSlotInfo>> GetManifestAsync(CancellationToken ct = default);

    Task SaveAsync(
        string slot, byte[] content, string contentType, int width, int height, CancellationToken ct = default);

    /// <summary>Returns false when there was nothing to remove.</summary>
    Task<bool> DeleteAsync(string slot, CancellationToken ct = default);
}

/// <remarks>
/// This service knows only about uploads. What a slot falls back to when there is no upload — a
/// URL from the environment, then the artwork bundled with the front end — is decided where the
/// images are actually served, so there is one place to configure it and not two.
/// </remarks>
public class BrandingService(VextaDbContext db) : IBrandingService
{
    public const long MaxBytes = 2L * 1024 * 1024;

    /// <summary>
    /// Raster formats plus SVG. Anything else is refused rather than stored and served back to
    /// every visitor: this endpoint is anonymous, so whatever lands here is public.
    /// </summary>
    public static readonly string[] AllowedContentTypes =
    [
        "image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"
    ];

    public Task<BrandingAsset?> GetAsync(string slot, CancellationToken ct = default) =>
        db.BrandingAssets.AsNoTracking().FirstOrDefaultAsync(a => a.Slot == slot, ct);

    public async Task<IReadOnlyList<BrandingSlotInfo>> GetManifestAsync(CancellationToken ct = default)
    {
        // Projected without Content: the manifest is asked for on every page render, and the
        // bytes would be several hundred kilobytes of pure waste on each one.
        var uploaded = await db.BrandingAssets
            .AsNoTracking()
            .Select(a => new { a.Slot, a.ETag, a.Width, a.Height })
            .ToDictionaryAsync(a => a.Slot, ct);

        return BrandingSlots.All
            .Select(slot => uploaded.TryGetValue(slot, out var asset)
                ? new BrandingSlotInfo(slot, true, asset.ETag, asset.Width, asset.Height)
                : new BrandingSlotInfo(slot, false, null, 0, 0))
            .ToList();
    }

    public async Task SaveAsync(
        string slot, byte[] content, string contentType, int width, int height, CancellationToken ct = default)
    {
        // Derived from the bytes, so re-uploading the same file keeps the same tag and browsers
        // that already hold it are not made to download it again.
        var etag = Convert.ToHexString(SHA256.HashData(content))[..32].ToLowerInvariant();

        var existing = await db.BrandingAssets.FirstOrDefaultAsync(a => a.Slot == slot, ct);
        if (existing is null)
        {
            db.BrandingAssets.Add(new BrandingAsset
            {
                Slot = slot,
                Content = content,
                ContentType = contentType,
                Width = width,
                Height = height,
                ETag = etag
            });
        }
        else
        {
            existing.Content = content;
            existing.ContentType = contentType;
            existing.Width = width;
            existing.Height = height;
            existing.ETag = etag;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(ct);
    }

    public async Task<bool> DeleteAsync(string slot, CancellationToken ct = default)
    {
        var existing = await db.BrandingAssets.FirstOrDefaultAsync(a => a.Slot == slot, ct);
        if (existing is null)
        {
            return false;
        }

        db.BrandingAssets.Remove(existing);
        await db.SaveChangesAsync(ct);
        return true;
    }
}
