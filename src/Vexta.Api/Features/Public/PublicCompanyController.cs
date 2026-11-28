using Vexta.Api.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Company;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Public;

/// <summary>
/// The company's page as a stranger reads it. The only endpoint on Vexta that answers someone
/// with no account, no session and no tenant.
///
/// Two rules hold it together. Every query names the tenant explicitly and ignores the query
/// filters, because there is no signed-in tenant for them to resolve against — left alone they
/// would compare against null and answer nothing. And the projection is an allow-list, not an
/// exclusion list: the shape below is everything a visitor is ever told, so a column added to
/// <c>Product</c> or <c>Tenant</c> later cannot find its way onto a public page by accident.
/// </summary>
[ApiController]
[Route("api/public/companies")]
[AllowAnonymous]
public class PublicCompanyController(VextaDbContext db, IR2StorageService storage) : ControllerBase
{
    [HttpGet("{slug}")]
    public async Task<ActionResult<PublicCompanyDto>> Get(string slug, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(slug)) return NotFound();

        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Slug == slug)
            .Select(t => new { t.Id, t.SubscriptionStatus, t.TrialEndsAt })
            .FirstOrDefaultAsync(ct);

        if (tenant is null) return NotFound();

        // A lapsed subscription takes the page down with the rest of the product. It has to be
        // this way round: the editor is behind the same gate, so a company that stopped paying
        // could not take its own page off the internet if we kept serving it.
        if (!TenantLive.IsLive(tenant.SubscriptionStatus, tenant.TrialEndsAt)) return NotFound();

        var page = await db.PublicPages.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == tenant.Id, ct);

        // An unpublished page is a 404 and not a 403: a visitor who asked for a slug that has
        // chosen not to have a page should not be able to tell it apart from one that does not
        // exist. The answer is the same either way.
        if (page is null || !page.IsPublished) return NotFound();

        var content = new PublicPageContent(db, storage);
        var company = await content.CompanyAsync(tenant.Id, page, await content.SavedSectionsAsync(tenant.Id, ct), ct);

        return company is null ? NotFound() : Ok(company);
    }

}

/// <summary>
/// Everything a visitor is told about a company, and nothing else. No client, no invoice, no
/// purchase price, no quantity on hand, no employee.
/// </summary>
public record PublicCompanyDto(
    string Name,
    string Slug,
    string? Headline,
    string? About,
    string? ContactNote,
    /// <summary>The address the company publishes for enquiries, not an employee's.</summary>
    string? Email,
    string? Phone,
    string? LogoETag,
    /// <summary>Only so the page can build the logo URL, which is anonymous by design.</summary>
    Guid TenantId,
    string? BrandColor,
    /// <summary>Which of the arrangements the page is drawn with.</summary>
    PublicPageStyle Style,
    /// <summary>Whether a visitor may order the products rather than only look at them.</summary>
    bool AcceptsOrders,
    /// <summary>Whether ordering here means paying for it on the spot.</summary>
    bool RequiresPayment,
    CompanyAddressDto? Address,
    List<PublicProductDto> Products,
    List<PublicJobDto> Jobs,
    /// <summary>The forms the company offers its visitors. Empty unless the page shows them.</summary>
    List<PublicPageFormDto> Forms,
    /// <summary>
    /// The bands the company arranged, in order. Empty for a company that never opened the
    /// builder, and the page is then drawn the way it always was.
    /// </summary>
    List<PublicSectionDto> Sections,
    /// <summary>The heading over the way to reach the company. Null says « Nous joindre ».</summary>
    string? FooterTitle = null,
    /// <summary>A last line under everything: a licence number, a copyright, the hours.</summary>
    string? FooterText = null);

/// <summary>One band of a built page: a heading over one to twelve columns.</summary>
public record PublicSectionDto(
    Guid Id,
    string? Title,
    PageSectionBackground Background,
    List<PublicCellDto> Cells);

/// <summary>
/// One column, with its content already resolved. Resolved here rather than by the page: a
/// visitor's browser must not be told a gallery's id and then allowed to ask for its contents.
/// </summary>
public record PublicCellDto(
    PublicPageSectionKind Kind,
    string? Title,
    string? Text,
    int ItemsPerRow,
    PageItemShape Shape,
    /// <summary>The photographs, for a Galerie. Signed for this response.</summary>
    List<PublicGalleryImageDto> Images,
    /// <summary>The single photograph, for an Image.</summary>
    string? ImageUrl,
    /// <summary>The form, for a Formulaire. Null when it was unpublished since.</summary>
    PublicPageFormDto? Form);

public record PublicGalleryImageDto(Guid Id, string? Caption, string? Url);

/// <summary>A product on the shop window. The selling price is the only figure on it.</summary>
public record PublicProductDto(
    Guid Id,
    int Number,
    string Title,
    string? Description,
    /// <summary>How it is sold: un, pi², sac. What the price is per.</summary>
    string? Unit,
    string? CategoryName,
    decimal? SellingPrice,
    string? ImageUrl,
    string? SubCategoryName,
    /// <summary>Every photograph, the main one first, for the product's own window.</summary>
    List<PublicProductImageDto> Images,
    /// <summary>
    /// For a parent: the sizes or versions a visitor chooses between. What goes in the basket is
    /// the variant, at the variant's price.
    /// </summary>
    List<PublicVariantDto> Variants);

public record PublicProductImageDto(string Url, string? Name);

public record PublicVariantDto(Guid Id, string Title, string? Unit, decimal? SellingPrice);
