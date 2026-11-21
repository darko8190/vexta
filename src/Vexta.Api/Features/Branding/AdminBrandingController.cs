using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Branding;

/// <summary>Uploading and clearing the platform's logo and icon, from the super admin's session.</summary>
[ApiController]
[Route("api/admin/branding")]
[Authorize(Roles = nameof(UserRole.SuperAdmin))]
public class AdminBrandingController(IBrandingService branding) : ControllerBase
{
    [HttpPut("{slot}")]
    public async Task<IActionResult> Upload(string slot, UploadBrandingRequest request, CancellationToken ct)
    {
        if (!BrandingSlots.IsValid(slot))
        {
            return BadRequest(new { message = "Emplacement d'image inconnu." });
        }

        var contentType = request.ContentType?.Trim().ToLowerInvariant();
        if (contentType is null
            || !BrandingService.AllowedContentTypes.Contains(contentType, StringComparer.Ordinal))
        {
            return BadRequest(new { message = "Format accepté : PNG, JPEG, WebP, SVG ou ICO." });
        }

        if (request.Content.Length == 0)
        {
            return BadRequest(new { message = "Le fichier est vide." });
        }

        if (request.Content.Length > BrandingService.MaxBytes)
        {
            return BadRequest(new { message = "L'image ne doit pas dépasser 2 Mo." });
        }

        // A browser reports 0 for an SVG without intrinsic dimensions, which is legitimate, so
        // these are clamped rather than required.
        var width = Math.Clamp(request.Width, 0, 10_000);
        var height = Math.Clamp(request.Height, 0, 10_000);

        await branding.SaveAsync(slot, request.Content, contentType, width, height, ct);
        return NoContent();
    }

    /// <summary>Removes the upload, putting the slot back to the image configured in the environment.</summary>
    [HttpDelete("{slot}")]
    public async Task<IActionResult> Reset(string slot, CancellationToken ct)
    {
        if (!BrandingSlots.IsValid(slot))
        {
            return BadRequest(new { message = "Emplacement d'image inconnu." });
        }

        return await branding.DeleteAsync(slot, ct) ? NoContent() : NotFound();
    }
}
