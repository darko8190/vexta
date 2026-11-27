using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Company;

[ApiController]
[Route("api/company")]
public class CompanyController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    private const int MaxBytes = 2 * 1024 * 1024;

    private static readonly HashSet<string> AllowedContentTypes =
        new(StringComparer.OrdinalIgnoreCase) { "image/png", "image/jpeg", "image/webp", "image/svg+xml" };

    /// <summary>
    /// Readable by everyone in the company, not only its owner: the name, address and phone are
    /// what people put on a quote, and an employee who cannot read them has to go and ask.
    /// </summary>
    [HttpGet("profile")]
    [Authorize]
    [StaffOnly]
    [RequireActiveSubscription]
    public async Task<ActionResult<CompanyProfileDto>> Profile(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => new
            {
                t.Id, t.Name, t.Slug, t.Kind, t.Description, t.ContactEmail, t.Phone, t.BrandColor,
                t.BusinessNumber,
                LogoETag = t.Logo!.ETag
            })
            .FirstOrDefaultAsync(ct);

        if (tenant is null) return NotFound();

        var address = await db.CompanyLocations.AsNoTracking()
            .Where(l => l.IsPrimary)
            .Select(l => new CompanyAddressDto(l.Label, l.Line1, l.Line2, l.City, l.Province, l.PostalCode, l.Country))
            .FirstOrDefaultAsync(ct);

        return Ok(new CompanyProfileDto(
            tenant.Id, tenant.Name, tenant.Slug, tenant.Kind.ToString(),
            tenant.Description, tenant.ContactEmail, tenant.Phone, tenant.LogoETag,
            tenant.BrandColor, tenant.BusinessNumber, address));
    }

    /// <summary>
    /// The tabs and sub-tabs hidden from the company's menus. Read by everyone in the company,
    /// since everyone's menu follows it, and without the subscription gate: a menu must still
    /// draw while a payment is being sorted out.
    /// </summary>
    [HttpGet("menu")]
    [Authorize]
    [StaffOnly]
    public async Task<ActionResult<HiddenNavigationDto>> HiddenNavigation(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Ok(new HiddenNavigationDto([]));

        var json = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.HiddenNavigation)
            .FirstOrDefaultAsync(ct);

        var keys = json is null ? [] : System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? [];
        return Ok(new HiddenNavigationDto(keys));
    }

    /// <summary>The owner's choice, for the whole company. The whole list every time.</summary>
    [HttpPut("menu")]
    [StaffOnly]
    [Authorize(Roles = Roles.Owner)]
    [RequireActiveSubscription]
    public async Task<IActionResult> SaveHiddenNavigation(HiddenNavigationDto request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var keys = (request.Keys ?? [])
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k.Trim())
            .Distinct()
            .ToList();
        if (keys.Count > 500 || keys.Any(k => k.Length > 200))
            return BadRequest(new { message = "Liste d'onglets masqués invalide." });

        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        if (tenant is null) return NotFound();

        tenant.HiddenNavigation = keys.Count == 0 ? null : System.Text.Json.JsonSerializer.Serialize(keys);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>The setup guide's progress, as last saved. Null when it was never opened.</summary>
    [HttpGet("guide")]
    [StaffOnly]
    [Authorize(Roles = Roles.Owner)]
    [RequireActiveSubscription]
    public async Task<ActionResult<SetupGuideDto>> Guide(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var state = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.SetupGuide)
            .FirstOrDefaultAsync(ct);

        return Ok(new SetupGuideDto(state is null ? null : System.Text.Json.JsonDocument.Parse(state).RootElement));
    }

    /// <summary>
    /// Kept as given: the screen owns its shape, so a new step needs no change here. Only its
    /// size and that it is a JSON object are checked.
    /// </summary>
    [HttpPut("guide")]
    [StaffOnly]
    [Authorize(Roles = Roles.Owner)]
    [RequireActiveSubscription]
    public async Task<IActionResult> SaveGuide(SaveSetupGuideRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (request.State.ValueKind != System.Text.Json.JsonValueKind.Object)
        {
            return BadRequest(new { message = "État du guide invalide." });
        }

        var json = request.State.GetRawText();
        if (json.Length > 20_000) return BadRequest(new { message = "État du guide trop volumineux." });

        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        if (tenant is null) return NotFound();

        tenant.SetupGuide = json;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPut("profile")]
    [StaffOnly]
    [Authorize(Roles = Roles.Owner)]
    [RequireActiveSubscription]
    public async Task<ActionResult<CompanyProfileDto>> SaveProfile(SaveCompanyProfileRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest(new { message = "Le nom est obligatoire." });
        if (request.Name.Trim().Length > 200) return BadRequest(new { message = "200 caractères maximum." });
        if (request.Description is { Length: > 2000 }) return BadRequest(new { message = "La description ne peut pas dépasser 2000 caractères." });

        // Validated here, not where it is painted: this value ends up in a CSS variable in
        // every browser and in a colour handed to the PDF renderer, and neither is a place to
        // discover that someone sent "red" or a stylesheet fragment.
        var brandColor = NormalizeColor(request.BrandColor);
        if (brandColor is null && !string.IsNullOrWhiteSpace(request.BrandColor))
        {
            return BadRequest(new { message = "La couleur doit être au format #RRGGBB." });
        }

        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        if (tenant is null) return NotFound();

        // The slug is deliberately left alone: it is in links people have already saved.
        tenant.Name = request.Name.Trim();
        tenant.Description = Clean(request.Description);
        tenant.ContactEmail = Clean(request.ContactEmail);
        tenant.Phone = Clean(request.Phone);
        tenant.BrandColor = brandColor;
        tenant.BusinessNumber = Clean(request.BusinessNumber);

        await db.SaveChangesAsync(ct);
        return await Profile(ct);
    }

    /// <summary>
    /// Anonymous, like the platform's branding: a logo is shown on pages that may have no
    /// session, and it is a public mark by nature. Scoped by the tenant id in the route.
    /// </summary>
    [HttpGet("{tenantId:guid}/logo")]
    [AllowAnonymous]
    public async Task<IActionResult> Logo(Guid tenantId, CancellationToken ct)
    {
        var logo = await db.TenantLogos.AsNoTracking().FirstOrDefaultAsync(l => l.TenantId == tenantId, ct);
        if (logo is null) return NotFound();

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        // An SVG is a document: without this, one carrying a script would run on our origin.
        Response.Headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

        // The ETag is what lets the front end cache hard and still show a new logo at once.
        return File(
            logo.Content,
            logo.ContentType,
            lastModified: logo.UpdatedAt,
            entityTag: new Microsoft.Net.Http.Headers.EntityTagHeaderValue($"\"{logo.ETag}\""));
    }

    [HttpPut("logo")]
    [Authorize(Roles = Roles.Owner)]
    [RequireActiveSubscription]
    public async Task<IActionResult> UploadLogo(UploadCompanyLogoRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        if (request.Content is null || request.Content.Length == 0)
            return BadRequest(new { message = "Le fichier est vide." });
        if (request.Content.Length > MaxBytes)
            return BadRequest(new { message = "Le logo ne peut pas dépasser 2 Mo." });
        if (!AllowedContentTypes.Contains(request.ContentType))
            return BadRequest(new { message = "Formats acceptés : PNG, JPEG, WebP ou SVG." });

        var etag = Convert.ToHexStringLower(SHA256.HashData(request.Content))[..32];

        var logo = await db.TenantLogos.FirstOrDefaultAsync(l => l.TenantId == tenantId, ct);
        if (logo is null)
        {
            logo = new TenantLogo
            {
                TenantId = tenantId,
                ContentType = request.ContentType,
                Content = request.Content,
                ETag = etag
            };
            db.TenantLogos.Add(logo);
        }
        else
        {
            logo.ContentType = request.ContentType;
            logo.Content = request.Content;
            logo.ETag = etag;
        }

        logo.Width = request.Width;
        logo.Height = request.Height;
        logo.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(new { eTag = etag });
    }

    [HttpDelete("logo")]
    [Authorize(Roles = Roles.Owner)]
    [RequireActiveSubscription]
    public async Task<IActionResult> DeleteLogo(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var logo = await db.TenantLogos.FirstOrDefaultAsync(l => l.TenantId == tenantId, ct);
        if (logo is null) return NoContent();

        db.TenantLogos.Remove(logo);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// #RRGGBB upper-cased, or null for both "none chosen" and "not a colour". The caller tells
    /// the two apart by looking at what was sent.
    /// </summary>
    private static string? NormalizeColor(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var hex = value.Trim();
        if (hex.Length != 7 || hex[0] != '#') return null;

        return hex[1..].All(Uri.IsHexDigit) ? hex.ToUpperInvariant() : null;
    }
}
