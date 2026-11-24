﻿﻿using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Company;

/// <summary>
/// Where the owner writes the company's public page and the positions it is hiring for.
///
/// The owner only, like the rest of the company's card: this is the face the business shows the
/// world, and an employee turning it on or off is not a decision the employee should be making.
///
/// Every query here scopes by the signed-in tenant by hand. <see cref="PublicPage"/> and
/// <see cref="Domain.JobPosting"/> carry no query filter — a visitor with no session reads them through
/// the slug in the route — so the safety net the rest of the application leans on is absent, and
/// a forgotten clause would let one company edit another's page.
/// </summary>
[ApiController]
[Route("api/company")]
[StaffOnly]
[Authorize(Roles = Roles.Owner)]
[RequireActiveSubscription]
public class PublicPageController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>
    /// Reading the page creates nothing. A company that has never opened this screen has no row,
    /// and inventing one on a GET would publish nothing but would still record a decision nobody
    /// made — so the defaults are answered from here and the row appears on the first save.
    /// </summary>
    [HttpGet("public-page")]
    public async Task<ActionResult<PublicPageSettingsDto>> GetPublicPage(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var slug = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.Slug)
            .FirstOrDefaultAsync(ct);

        if (slug is null) return NotFound();

        var page = await db.PublicPages.AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == tenantId, ct);

        return Ok(page is null
            ? new PublicPageSettingsDto(
                false, null, null, null, true, true, false, false, PublicPageStyle.Classique, slug, null)
            : new PublicPageSettingsDto(
                page.IsPublished, page.Headline, page.About, page.ContactNote,
                page.ShowProducts, page.ShowJobs, page.ShowForms, page.AcceptsOrders,
                page.Style, slug, page.UpdatedAt));
    }

    [HttpPut("public-page")]
    public async Task<ActionResult<PublicPageSettingsDto>> SavePublicPage(
        SavePublicPageRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        if (request.Headline is { Length: > 200 })
            return BadRequest(new { message = "L'accroche ne peut pas dépasser 200 caractères." });
        if (request.About is { Length: > 4000 })
            return BadRequest(new { message = "La présentation ne peut pas dépasser 4000 caractères." });
        if (request.ContactNote is { Length: > 1000 })
            return BadRequest(new { message = "La note de contact ne peut pas dépasser 1000 caractères." });

        var page = await db.PublicPages.FirstOrDefaultAsync(p => p.TenantId == tenantId, ct);
        if (page is null)
        {
            page = new PublicPage { TenantId = tenantId };
            db.PublicPages.Add(page);
        }

        page.IsPublished = request.IsPublished;
        page.Headline = Clean(request.Headline);
        page.About = Clean(request.About);
        page.ContactNote = Clean(request.ContactNote);
        page.ShowProducts = request.ShowProducts;
        page.ShowJobs = request.ShowJobs;
        page.ShowForms = request.ShowForms;
        page.AcceptsOrders = request.AcceptsOrders;
        page.Style = Enum.IsDefined(request.Style) ? request.Style : PublicPageStyle.Classique;
        page.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return await GetPublicPage(ct);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
