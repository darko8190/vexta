using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Branding;

/// <summary>
/// The logo and icon, readable by anyone: the sign-in page and the public site both need them
/// before there is a session.
/// </summary>
[ApiController]
[Route("api/branding")]
[AllowAnonymous]
public class BrandingController(IBrandingService branding) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<BrandingSlotDto>>> Manifest(CancellationToken ct)
    {
        var manifest = await branding.GetManifestAsync(ct);
        return Ok(manifest.Select(s =>
            new BrandingSlotDto(s.Slot, s.IsUploaded, s.ETag, s.Width, s.Height)));
    }

    [HttpGet("{slot}")]
    public async Task<IActionResult> Image(string slot, CancellationToken ct)
    {
        if (!BrandingSlots.IsValid(slot))
        {
            return NotFound();
        }

        var asset = await branding.GetAsync(slot, ct);
        if (asset is null)
        {
            // No upload for this slot. The caller falls back to the environment's URL, or to the
            // artwork bundled with the front end.
            return NotFound();
        }

        // An uploaded SVG can carry script, and this response is same-origin once proxied, so it
        // would run as our own code. These two headers stop that: nothing may load, and the type
        // declared here is the only one the browser will consider.
        Response.Headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'";
        Response.Headers["X-Content-Type-Options"] = "nosniff";

        // The ETag is what lets the front end cache hard and still show a new logo at once.
        return File(
            asset.Content,
            asset.ContentType,
            lastModified: asset.UpdatedAt,
            entityTag: new EntityTagHeaderValue($"\"{asset.ETag}\""));
    }
}
