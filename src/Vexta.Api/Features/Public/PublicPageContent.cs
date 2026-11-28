using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Company;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Public;

/// <summary>A band as it is about to be resolved: saved, or a draft from the builder.</summary>
public record SectionSource(Guid Id, string? Title, PageSectionBackground Background, List<PageCell> Cells);

/// <summary>
/// What a public page is made of, read for one company.
///
/// Shared by the page a visitor reads and the preview the owner edits, so the two draw the same
/// products, postings and columns. Every query names the tenant and ignores the query filters:
/// a visitor has no tenant for them to resolve against.
/// </summary>
public class PublicPageContent(VextaDbContext db, IR2StorageService storage)
{
    /// <summary>How many photographs a product's own window shows at most.</summary>
    private const int MaxProductImages = 8;

    /// <summary>
    /// The whole page for one company, with the bands given. The caller decides whether the
    /// page may be shown at all; this only reads it.
    /// </summary>
    public async Task<PublicCompanyDto?> CompanyAsync(
        Guid tenantId, PublicPage page, IReadOnlyList<SectionSource> sections, CancellationToken ct)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.Slug,
                t.ContactEmail,
                t.Phone,
                t.BrandColor,
                CanCharge = t.StripeAccountId != null && t.StripeChargesEnabled,
                LogoETag = t.Logo!.ETag
            })
            .FirstOrDefaultAsync(ct);

        if (tenant is null) return null;

        var address = await db.CompanyLocations.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.TenantId == tenant.Id && l.IsPrimary)
            .Select(l => new CompanyAddressDto(
                l.Label, l.Line1, l.Line2, l.City, l.Province, l.PostalCode, l.Country))
            .FirstOrDefaultAsync(ct);

        var products = page.ShowProducts ? await ProductsAsync(tenant.Id, ct) : [];
        var jobs = page.ShowJobs ? await JobsAsync(tenant.Id, ct) : [];

        // Titles only. The questions are fetched when somebody opens one: most visitors read a
        // page and fill nothing.
        var forms = page.ShowForms
            ? (await PublicFormGate.ListAsync(db, tenant.Id, ct))
                .Select(f => new PublicPageFormDto(f.FormId, f.Title, f.Description, f.Kind))
                .ToList()
            : [];

        // What the owner chose to hide is left out here rather than hidden by the page: a visitor
        // is not sent what the company decided not to show.
        return new PublicCompanyDto(
            tenant.Name,
            tenant.Slug,
            page.ShowHeadline ? page.Headline : null,
            page.ShowAbout ? page.About : null,
            page.ContactNote,
            page.FooterShowEmail ? tenant.ContactEmail : null,
            page.FooterShowPhone ? tenant.Phone : null,
            page.ShowLogo ? tenant.LogoETag : null,
            tenant.Id,
            tenant.BrandColor,
            page.Style,
            // Products and orders are two switches, and both have to be on. A company that asks
            // to be paid at its counter needs a Stripe account that can take the money too, or
            // the page would offer a basket that refuses at the till.
            page.ShowProducts && page.AcceptsOrders
                && (!page.RequiresOnlinePayment || tenant.CanCharge),
            page.RequiresOnlinePayment,
            page.FooterShowAddress ? address : null,
            products,
            jobs,
            forms,
            await SectionsAsync(tenant.Id, sections, ct),
            page.FooterTitle,
            page.FooterText);
    }

    /// <summary>The visible bands, in order, as they were saved.</summary>
    public async Task<List<SectionSource>> SavedSectionsAsync(Guid tenantId, CancellationToken ct)
    {
        var rows = await db.PublicPageSections.IgnoreQueryFilters().AsNoTracking()
            .Where(s => s.TenantId == tenantId && s.IsVisible)
            .OrderBy(s => s.SortOrder)
            .Select(s => new { s.Id, s.Title, s.Background, s.CellsJson })
            .ToListAsync(ct);

        return rows.Select(r => new SectionSource(r.Id, r.Title, r.Background, PageCells.Read(r.CellsJson))).ToList();
    }

    /// <summary>
    /// The bands with their photographs signed and their forms named.
    ///
    /// A column that lost what it pointed at keeps its place and draws nothing, so the columns
    /// beside it do not slide over. A band with nothing left in any column, and no heading, is
    /// dropped.
    /// </summary>
    public async Task<List<PublicSectionDto>> SectionsAsync(
        Guid tenantId, IReadOnlyList<SectionSource> sources, CancellationToken ct)
    {
        if (sources.Count == 0) return [];

        var cells = sources.SelectMany(s => s.Cells).ToList();

        var galleryIds = cells.Where(c => c.Kind == PublicPageSectionKind.Galerie)
            .Select(c => c.GalleryId).OfType<Guid>().Distinct().ToList();
        var galleries = await GalleryImagesAsync(tenantId, galleryIds, ct);

        var assetIds = cells.Where(c => c.Kind == PublicPageSectionKind.Image)
            .Select(c => c.MediaAssetId).OfType<Guid>().Distinct().ToList();
        var assets = assetIds.Count == 0
            ? []
            : await db.MediaAssets.IgnoreQueryFilters().AsNoTracking()
                .Where(m => assetIds.Contains(m.Id) && m.TenantId == tenantId)
                .Select(m => new { m.Id, m.ObjectKey, m.FileName })
                .ToListAsync(ct);

        var assetUrls = new Dictionary<Guid, string?>();
        foreach (var asset in assets) assetUrls[asset.Id] = await UrlOrNullAsync(asset.ObjectKey, asset.FileName, ct);

        var formIds = cells.Where(c => c.Kind == PublicPageSectionKind.Formulaire)
            .Select(c => c.FormTemplateId).OfType<Guid>().Distinct().ToList();
        var forms = formIds.Count == 0
            ? []
            : await db.FormTemplates.IgnoreQueryFilters().AsNoTracking()
                .Where(f => formIds.Contains(f.Id) && f.TenantId == tenantId && f.IsPublished)
                .Select(f => new PublicPageFormDto(f.Id, f.Title, f.Description, f.Kind))
                .ToListAsync(ct);

        var sections = new List<PublicSectionDto>(sources.Count);

        foreach (var source in sources)
        {
            var resolved = source.Cells.Select(cell => new PublicCellDto(
                cell.Kind,
                cell.Title,
                cell.Kind == PublicPageSectionKind.Texte ? cell.Text : null,
                Math.Clamp(cell.ItemsPerRow, 1, 6),
                cell.Shape,
                cell.Kind == PublicPageSectionKind.Galerie && cell.GalleryId is { } g && galleries.TryGetValue(g, out var images)
                    ? images
                    : [],
                cell.Kind == PublicPageSectionKind.Image && cell.MediaAssetId is { } m ? assetUrls.GetValueOrDefault(m) : null,
                cell.Kind == PublicPageSectionKind.Formulaire && cell.FormTemplateId is { } f
                    ? forms.FirstOrDefault(x => x.Id == f)
                    : null)).ToList();

            if (resolved.Count == 0 && source.Title is null) continue;

            sections.Add(new PublicSectionDto(source.Id, source.Title, source.Background, resolved));
        }

        return sections;
    }

    /// <summary>The photographs of each gallery asked for, signed, in their order.</summary>
    public async Task<Dictionary<Guid, List<PublicGalleryImageDto>>> GalleryImagesAsync(
        Guid tenantId, IReadOnlyCollection<Guid>? galleryIds, CancellationToken ct)
    {
        var query = db.GalleryImages.IgnoreQueryFilters().AsNoTracking().Where(i => i.TenantId == tenantId);
        if (galleryIds is not null)
        {
            if (galleryIds.Count == 0) return [];
            query = query.Where(i => galleryIds.Contains(i.GalleryId));
        }

        var rows = await query
            .OrderBy(i => i.SortOrder)
            .Select(i => new { i.Id, i.GalleryId, i.Caption, i.MediaAsset!.ObjectKey, i.MediaAsset!.FileName })
            .ToListAsync(ct);

        var result = new Dictionary<Guid, List<PublicGalleryImageDto>>();
        foreach (var row in rows)
        {
            if (!result.TryGetValue(row.GalleryId, out var list)) result[row.GalleryId] = list = [];
            list.Add(new PublicGalleryImageDto(row.Id, row.Caption, await UrlOrNullAsync(row.ObjectKey, row.FileName, ct)));
        }

        return result;
    }

    /// <summary>
    /// The products ticked as public, each with its photographs, the main one first.
    ///
    /// A variant of a public parent is not listed on its own: it is one of the choices on its
    /// parent's card. A missing signature is a product without a picture, never a page without
    /// products.
    /// </summary>
    public async Task<List<PublicProductDto>> ProductsAsync(Guid tenantId, CancellationToken ct)
    {
        var rows = await db.Products.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.IsPublic
                && !(p.ParentProductId != null && p.ParentProduct!.IsPublic))
            .OrderBy(p => p.Title)
            .Select(p => new
            {
                p.Id,
                p.Number,
                p.Title,
                p.Description,
                p.Unit,
                CategoryName = p.Category == null ? null : p.Category.Name,
                SubCategoryName = p.SubCategory == null ? null : p.SubCategory.Name,
                p.SellingPrice,
                p.IsParent,
                Images = p.Images
                    .OrderByDescending(i => i.IsPrimary).ThenBy(i => i.SortOrder)
                    .Take(MaxProductImages)
                    .Select(i => new { i.Name, i.MediaAsset!.ObjectKey, i.MediaAsset!.FileName })
                    .ToList(),
                Variants = p.Variants
                    .Where(v => !v.IsParent)
                    .OrderBy(v => v.SellingPrice).ThenBy(v => v.Title)
                    .Select(v => new PublicVariantDto(v.Id, v.Title, v.Unit, v.SellingPrice))
                    .ToList()
            })
            .ToListAsync(ct);

        var products = new List<PublicProductDto>(rows.Count);

        foreach (var row in rows)
        {
            var images = new List<PublicProductImageDto>(row.Images.Count);
            foreach (var image in row.Images)
            {
                if (await UrlOrNullAsync(image.ObjectKey, image.FileName, ct) is { } url)
                    images.Add(new PublicProductImageDto(url, image.Name));
            }

            // A parent's price on the card is its cheapest variant's, the "à partir de" figure.
            var variants = row.IsParent ? row.Variants : [];
            var price = row.SellingPrice;
            if (row.IsParent)
            {
                var prices = variants.Select(v => v.SellingPrice).OfType<decimal>().ToList();
                price = prices.Count > 0 ? prices.Min() : null;
            }

            products.Add(new PublicProductDto(
                row.Id, row.Number, row.Title, row.Description, row.Unit, row.CategoryName,
                price, images.FirstOrDefault()?.Url, row.SubCategoryName, images, variants));
        }

        return products;
    }

    /// <summary>
    /// The positions on the public page, each with whatever the company hung on it.
    ///
    /// A posting whose form is still a draft reports no form rather than a form that cannot be
    /// filled: the visitor is shown where to write instead.
    /// </summary>
    public async Task<List<PublicJobDto>> JobsAsync(Guid tenantId, CancellationToken ct)
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
                j.Category,
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
                documents.Add(new PublicJobDocumentDto(
                    document.Id,
                    // The company's own label when it gave one, the file's name otherwise: a
                    // visitor should never be shown an object key or a bare id.
                    string.IsNullOrWhiteSpace(document.Label) ? document.FileName : document.Label!,
                    document.ContentType,
                    document.SizeBytes,
                    await UrlOrNullAsync(document.ObjectKey, document.FileName, ct)));
            }

            jobs.Add(new PublicJobDto(
                row.Id, row.Title, row.Description, row.Location, row.EmploymentType,
                row.Compensation, row.ApplyTo, row.HasForm, documents, row.CreatedAt, row.Category));
        }

        return jobs;
    }

    /// <summary>
    /// A signed link, or null when storage cannot be reached. Never an exception: an unreachable
    /// bucket must not take a company's whole page down with it.
    /// </summary>
    public async Task<string?> UrlOrNullAsync(string objectKey, string fileName, CancellationToken ct)
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
}
