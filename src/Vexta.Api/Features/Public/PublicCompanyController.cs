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
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.Slug,
                t.ContactEmail,
                t.Phone,
                t.BrandColor,
                t.SubscriptionStatus,
                LogoETag = t.Logo!.ETag
            })
            .FirstOrDefaultAsync(ct);

        if (tenant is null) return NotFound();

        // A lapsed subscription takes the page down with the rest of the product. It has to be
        // this way round: the editor is behind the same gate, so a company that stopped paying
        // could not take its own page off the internet if we kept serving it.
        if (tenant.SubscriptionStatus != TenantSubscriptionStatus.Active) return NotFound();

        var page = await db.PublicPages.AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == tenant.Id, ct);

        // An unpublished page is a 404 and not a 403: a visitor who asked for a slug that has
        // chosen not to have a page should not be able to tell it apart from one that does not
        // exist. The answer is the same either way.
        if (page is null || !page.IsPublished) return NotFound();

        var address = await db.CompanyLocations.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.TenantId == tenant.Id && l.IsPrimary)
            .Select(l => new CompanyAddressDto(
                l.Label, l.Line1, l.Line2, l.City, l.Province, l.PostalCode, l.Country))
            .FirstOrDefaultAsync(ct);

        var products = page.ShowProducts ? await ProductsAsync(tenant.Id, ct) : [];

        var jobs = page.ShowJobs ? await JobsAsync(tenant.Id, ct) : [];

        // Titles only. The questions are fetched when somebody opens one, like a posting's:
        // most visitors read a page and fill nothing.
        var forms = page.ShowForms
            ? (await PublicFormGate.ListAsync(db, tenant.Id, ct))
                .Select(f => new PublicPageFormDto(f.FormId, f.Title, f.Description, f.Kind))
                .ToList()
            : [];

        return Ok(new PublicCompanyDto(
            tenant.Name,
            tenant.Slug,
            page.Headline,
            page.About,
            page.ContactNote,
            tenant.ContactEmail,
            tenant.Phone,
            tenant.LogoETag,
            tenant.Id,
            tenant.BrandColor,
            page.Style,
            // Products and orders are two switches, and both have to be on: a basket on a page
            // that is not showing its products would be a basket with nothing to put in it.
            page.ShowProducts && page.AcceptsOrders,
            address,
            products,
            jobs,
            forms));
    }

    /// <summary>
    /// The positions on the public page, each with whatever the company hung on it.
    ///
    /// A posting whose form is still a draft reports no form rather than a form that cannot be
    /// filled: the visitor is shown where to write instead, which is what the posting said
    /// before a form was ever attached.
    /// </summary>
    private async Task<List<PublicJobDto>> JobsAsync(Guid tenantId, CancellationToken ct)
    {
        var rows = await db.JobPostings.IgnoreQueryFilters().AsNoTracking()
            .Where(j => j.TenantId == tenantId && j.IsPublished)
            .OrderByDescending(j => j.CreatedAt)
            .Select(j => new
            {
                j.Id,
                j.Title,
                j.Description,
                j.Location,
                j.EmploymentType,
                j.Compensation,
                j.ApplyTo,
                HasForm = j.FormTemplateId != null && j.FormTemplate!.IsPublished,
                j.CreatedAt,
                Documents = j.Documents
                    .OrderBy(d => d.SortOrder)
                    .Select(d => new
                    {
                        d.Id,
                        d.Label,
                        d.MediaAsset!.ObjectKey,
                        d.MediaAsset!.FileName,
                        d.MediaAsset!.ContentType,
                        d.MediaAsset!.SizeBytes
                    })
                    .ToList()
            })
            .ToListAsync(ct);

        var jobs = new List<PublicJobDto>(rows.Count);

        foreach (var row in rows)
        {
            var documents = new List<PublicJobDocumentDto>(row.Documents.Count);

            foreach (var document in row.Documents)
            {
                string? url = null;
                try
                {
                    url = await storage.CreateDownloadUrlAsync(document.ObjectKey, document.FileName, ct);
                }
                catch (InvalidOperationException)
                {
                    // Storage is not configured, or its credentials are wrong. The posting still
                    // belongs on the page; the attachment simply cannot be opened.
                }

                documents.Add(new PublicJobDocumentDto(
                    document.Id,
                    // The company's own label when it gave one, the file's name otherwise: a
                    // visitor should never be shown an object key or a bare id.
                    string.IsNullOrWhiteSpace(document.Label) ? document.FileName : document.Label!,
                    document.ContentType,
                    document.SizeBytes,
                    url));
            }

            jobs.Add(new PublicJobDto(
                row.Id, row.Title, row.Description, row.Location, row.EmploymentType,
                row.Compensation, row.ApplyTo, row.HasForm, documents, row.CreatedAt));
        }

        return jobs;
    }

    /// <summary>
    /// The products the company ticked as public, each with its first photograph.
    ///
    /// A missing signature is a product without a picture, not a page without products: storage
    /// that is unconfigured or unreachable must not take the whole company's page down with it.
    /// </summary>
    private async Task<List<PublicProductDto>> ProductsAsync(Guid tenantId, CancellationToken ct)
    {
        var rows = await db.Products.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.IsPublic)
            .OrderBy(p => p.Title)
            .Select(p => new
            {
                p.Id,
                p.Number,
                p.Title,
                p.Description,
                p.Unit,
                CategoryName = p.Category == null ? null : p.Category.Name,
                p.SellingPrice,
                Image = p.Images
                    .OrderBy(i => i.SortOrder)
                    .Select(i => new { i.MediaAsset!.ObjectKey, i.MediaAsset!.FileName })
                    .FirstOrDefault()
            })
            .ToListAsync(ct);

        var products = new List<PublicProductDto>(rows.Count);

        foreach (var row in rows)
        {
            string? imageUrl = null;

            if (row.Image is not null)
            {
                try
                {
                    imageUrl = await storage.CreateDownloadUrlAsync(row.Image.ObjectKey, row.Image.FileName, ct);
                }
                catch (InvalidOperationException)
                {
                    // Storage is not configured, or its credentials are wrong. The product still
                    // belongs on the page; it simply shows without a photograph.
                }
            }

            products.Add(new PublicProductDto(
                row.Id, row.Number, row.Title, row.Description, row.Unit, row.CategoryName,
                row.SellingPrice, imageUrl));
        }

        return products;
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
    /// <summary>Which of the four arrangements the page is drawn with.</summary>
    PublicPageStyle Style,
    /// <summary>Whether a visitor may order the products rather than only look at them.</summary>
    bool AcceptsOrders,
    CompanyAddressDto? Address,
    List<PublicProductDto> Products,
    List<PublicJobDto> Jobs,
    /// <summary>The forms the company offers its visitors. Empty unless the page shows them.</summary>
    List<PublicPageFormDto> Forms);

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
    string? ImageUrl);
