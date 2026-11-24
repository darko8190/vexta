using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Public;

/// <summary>One company with a page anybody can open.</summary>
public record DirectoryCompanyDto(
    string Name,
    string Slug,
    string? Headline,
    string? City,
    string? Province,
    /// <summary>Only so the card can build the logo URL, which is anonymous by design.</summary>
    Guid TenantId,
    string? LogoETag,
    string? BrandColor,
    int OpenJobs,
    int PublicProducts);

/// <summary>A position, with the company that is hiring attached.</summary>
public record DirectoryJobDto(
    Guid Id,
    string Title,
    string? Description,
    string? Location,
    EmploymentType EmploymentType,
    string? Compensation,
    DateOnly? PostedOn,
    string CompanyName,
    string CompanySlug,
    Guid TenantId);

/// <summary>A product on sale somewhere, with the company that sells it.</summary>
public record DirectoryProductDto(
    Guid Id,
    string Title,
    string? Description,
    string? CategoryName,
    decimal? SellingPrice,
    string? ImageUrl,
    string CompanyName,
    string CompanySlug);

/// <summary>
/// What the directory holds, so a menu can leave out what is empty.
/// </summary>
/// <param name="Categories">
/// The product categories actually in use across the published pages. Built from the rows
/// rather than from the category table: a category nobody has a public product in is a filter
/// that returns nothing, and a filter that returns nothing is a broken filter.
/// </param>
public record DirectorySummaryDto(
    int Companies,
    int Jobs,
    int Products,
    IReadOnlyList<string> Categories);

/// <summary>
/// Everything published across Vexta, read by a stranger.
///
/// The companies' own pages answer "what does this company offer". This answers the question
/// from the other side — "who is hiring", "who sells this" — which is the only way somebody
/// who does not already know a company's name can find it.
///
/// Three rules hold it together, and they are the same three the company pages follow. Every
/// query ignores the tenant filters and names its own conditions, because there is no signed-in
/// tenant to resolve against. Nothing is listed unless its company has a published page, with
/// the matching section switched on — a company that took its page offline is out of the
/// directory, not merely harder to reach. And the projections are allow-lists, so a column
/// added to Product or Tenant later cannot find its way out here by accident.
/// </summary>
[ApiController]
[Route("api/public/annuaire")]
[AllowAnonymous]
public class PublicDirectoryController(VextaDbContext db, IR2StorageService storage) : ControllerBase
{
    /// <summary>
    /// Enough for a page of cards, and a ceiling a caller cannot raise: these routes answer
    /// anybody at all, and an unbounded page size is an invitation to pull the whole platform
    /// down one request at a time.
    /// </summary>
    private const int MaxPageSize = 48;

    [HttpGet("sommaire")]
    public async Task<ActionResult<DirectorySummaryDto>> Summary(CancellationToken ct)
    {
        var companies = await PublishedTenantIdsAsync(ct);

        var jobs = companies.WithJobs.Count == 0
            ? 0
            : await db.JobPostings.IgnoreQueryFilters().AsNoTracking()
                .CountAsync(j => j.IsPublished && companies.WithJobs.Contains(j.TenantId), ct);

        var products = companies.WithProducts.Count == 0
            ? 0
            : await db.Products.IgnoreQueryFilters().AsNoTracking()
                .CountAsync(p => p.IsPublic && companies.WithProducts.Contains(p.TenantId), ct);

        var categories = companies.WithProducts.Count == 0
            ? []
            : await db.Products.IgnoreQueryFilters().AsNoTracking()
                .Where(p => p.IsPublic && companies.WithProducts.Contains(p.TenantId) && p.Category != null)
                .Select(p => p.Category!.Name)
                .Distinct()
                .OrderBy(name => name)
                .ToListAsync(ct);

        return Ok(new DirectorySummaryDto(companies.All.Count, jobs, products, categories));
    }

    [HttpGet("entreprises")]
    public async Task<ActionResult<PagedResult<DirectoryCompanyDto>>> Companies(
        [FromQuery] string? recherche, [FromQuery] int page = 1, [FromQuery] int pageSize = 24,
        CancellationToken ct = default)
    {
        var companies = await PublishedTenantIdsAsync(ct);
        if (companies.All.Count == 0) return Ok(Empty<DirectoryCompanyDto>(page, pageSize));

        var rows = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => companies.All.Contains(t.Id))
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.Slug,
                t.BrandColor,
                LogoETag = t.Logo == null ? null : t.Logo.ETag
            })
            .ToListAsync(ct);

        // The headline belongs to the page, not to the company, and the town to the address
        // table. Read as two lookups rather than as navigations: Tenant has neither, and giving
        // it them for one screen would hang a collection on an entity loaded everywhere.
        var headlines = await db.PublicPages.IgnoreQueryFilters().AsNoTracking()
            .Where(x => companies.All.Contains(x.TenantId))
            .Select(x => new { x.TenantId, x.Headline })
            .ToDictionaryAsync(x => x.TenantId, x => x.Headline, ct);

        var addresses = await db.CompanyLocations.IgnoreQueryFilters().AsNoTracking()
            .Where(l => companies.All.Contains(l.TenantId))
            .OrderByDescending(l => l.IsPrimary)
            .Select(l => new { l.TenantId, l.City, l.Province })
            .ToListAsync(ct);

        // The main one when there is one, otherwise whichever came first: a company with a
        // single address and nobody having pressed the star still has a town.
        var towns = addresses
            .GroupBy(l => l.TenantId)
            .ToDictionary(g => g.Key, g => g.First());

        // Filtered in memory, accent-insensitively, like the supplier directory: a search for
        // "beton" has to find "Les Bétons Lévis", and no database collation here does that
        // without a migration nobody asked for. The set is every published page on the
        // platform, which is small enough to hold.
        var needle = CompanyIdentity.Normalize(recherche);
        var matched = needle.Length == 0
            ? rows
            : rows.Where(r =>
                CompanyIdentity.Normalize(r.Name).Contains(needle, StringComparison.Ordinal)
                || CompanyIdentity.Normalize(headlines.GetValueOrDefault(r.Id))
                    .Contains(needle, StringComparison.Ordinal)
                || CompanyIdentity.Normalize(towns.GetValueOrDefault(r.Id)?.City)
                    .Contains(needle, StringComparison.Ordinal))
                .ToList();

        var ordered = matched.OrderBy(r => r.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
        var size = Clamp(pageSize);
        var skip = Math.Max(0, page - 1) * size;

        var jobCounts = await db.JobPostings.IgnoreQueryFilters().AsNoTracking()
            .Where(j => j.IsPublished && companies.WithJobs.Contains(j.TenantId))
            .GroupBy(j => j.TenantId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        var productCounts = await db.Products.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.IsPublic && companies.WithProducts.Contains(p.TenantId))
            .GroupBy(p => p.TenantId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        var items = ordered.Skip(skip).Take(size)
            .Select(r => new DirectoryCompanyDto(
                r.Name,
                r.Slug,
                headlines.GetValueOrDefault(r.Id),
                towns.GetValueOrDefault(r.Id)?.City,
                towns.GetValueOrDefault(r.Id)?.Province,
                r.Id,
                r.LogoETag,
                r.BrandColor,
                jobCounts.GetValueOrDefault(r.Id),
                productCounts.GetValueOrDefault(r.Id)))
            .ToList();

        return Ok(new PagedResult<DirectoryCompanyDto>
        {
            Items = items,
            Page = Math.Max(1, page),
            PageSize = size,
            TotalCount = ordered.Count
        });
    }

    [HttpGet("emplois")]
    public async Task<ActionResult<PagedResult<DirectoryJobDto>>> Jobs(
        [FromQuery] string? recherche,
        [FromQuery] EmploymentType? type,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 24,
        CancellationToken ct = default)
    {
        var companies = await PublishedTenantIdsAsync(ct);
        if (companies.WithJobs.Count == 0) return Ok(Empty<DirectoryJobDto>(page, pageSize));

        var rows = await db.JobPostings.IgnoreQueryFilters().AsNoTracking()
            .Where(j => j.IsPublished && companies.WithJobs.Contains(j.TenantId))
            .Where(j => type == null || j.EmploymentType == type)
            .Select(j => new
            {
                j.Id,
                j.Title,
                j.Description,
                j.Location,
                j.EmploymentType,
                j.Compensation,
                j.PostedOn,
                j.CreatedAt,
                j.TenantId
            })
            .ToListAsync(ct);

        var tenants = await CompanyNamesAsync(rows.Select(r => r.TenantId), ct);

        var needle = CompanyIdentity.Normalize(recherche);
        var matched = needle.Length == 0
            ? rows
            : rows.Where(r =>
                CompanyIdentity.Normalize(r.Title).Contains(needle, StringComparison.Ordinal)
                || CompanyIdentity.Normalize(r.Description).Contains(needle, StringComparison.Ordinal)
                || CompanyIdentity.Normalize(r.Location).Contains(needle, StringComparison.Ordinal)
                || CompanyIdentity.Normalize(tenants.GetValueOrDefault(r.TenantId)?.Name)
                    .Contains(needle, StringComparison.Ordinal))
                .ToList();

        // The most recently advertised first, with a posting that never got a date falling back
        // to when it was written. A job board ordered by anything else is a job board where the
        // same positions sit at the top for a year.
        var ordered = matched
            .OrderByDescending(r => r.PostedOn ?? DateOnly.FromDateTime(r.CreatedAt.LocalDateTime))
            .ThenByDescending(r => r.CreatedAt)
            .ToList();

        var size = Clamp(pageSize);

        var items = ordered.Skip(Math.Max(0, page - 1) * size).Take(size)
            .Select(r =>
            {
                var company = tenants.GetValueOrDefault(r.TenantId);
                return new DirectoryJobDto(
                    r.Id, r.Title, r.Description, r.Location, r.EmploymentType, r.Compensation,
                    r.PostedOn, company?.Name ?? "", company?.Slug ?? "", r.TenantId);
            })
            .ToList();

        return Ok(new PagedResult<DirectoryJobDto>
        {
            Items = items,
            Page = Math.Max(1, page),
            PageSize = size,
            TotalCount = ordered.Count
        });
    }

    [HttpGet("produits")]
    public async Task<ActionResult<PagedResult<DirectoryProductDto>>> Products(
        [FromQuery] string? recherche,
        [FromQuery] string? categorie,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 24,
        CancellationToken ct = default)
    {
        var companies = await PublishedTenantIdsAsync(ct);
        if (companies.WithProducts.Count == 0) return Ok(Empty<DirectoryProductDto>(page, pageSize));

        var rows = await db.Products.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.IsPublic && companies.WithProducts.Contains(p.TenantId))
            .Where(p => categorie == null || (p.Category != null && p.Category.Name == categorie))
            .Select(p => new
            {
                p.Id,
                p.Title,
                p.Description,
                CategoryName = p.Category == null ? null : p.Category.Name,
                p.SellingPrice,
                p.TenantId,
                Image = p.Images
                    .OrderBy(i => i.SortOrder)
                    .Select(i => new { i.MediaAsset!.ObjectKey, i.MediaAsset!.FileName })
                    .FirstOrDefault()
            })
            .ToListAsync(ct);

        var tenants = await CompanyNamesAsync(rows.Select(r => r.TenantId), ct);

        var needle = CompanyIdentity.Normalize(recherche);
        var matched = needle.Length == 0
            ? rows
            : rows.Where(r =>
                CompanyIdentity.Normalize(r.Title).Contains(needle, StringComparison.Ordinal)
                || CompanyIdentity.Normalize(r.Description).Contains(needle, StringComparison.Ordinal)
                || CompanyIdentity.Normalize(r.CategoryName).Contains(needle, StringComparison.Ordinal)
                || CompanyIdentity.Normalize(tenants.GetValueOrDefault(r.TenantId)?.Name)
                    .Contains(needle, StringComparison.Ordinal))
                .ToList();

        var ordered = matched.OrderBy(r => r.Title, StringComparer.CurrentCultureIgnoreCase).ToList();
        var size = Clamp(pageSize);
        var window = ordered.Skip(Math.Max(0, page - 1) * size).Take(size).ToList();

        var items = new List<DirectoryProductDto>(window.Count);

        // Signed one page at a time, not for every public product on the platform: a signature
        // is a round trip, and the ones nobody is looking at would be minted and thrown away.
        foreach (var row in window)
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
                    // Storage unconfigured or unreachable. The product still belongs in the
                    // list; it simply shows without a photograph.
                }
            }

            var company = tenants.GetValueOrDefault(row.TenantId);

            items.Add(new DirectoryProductDto(
                row.Id, row.Title, row.Description, row.CategoryName, row.SellingPrice, imageUrl,
                company?.Name ?? "", company?.Slug ?? ""));
        }

        return Ok(new PagedResult<DirectoryProductDto>
        {
            Items = items,
            Page = Math.Max(1, page),
            PageSize = size,
            TotalCount = ordered.Count
        });
    }

    /// <summary>
    /// Which companies are in the directory at all, and which of them are showing jobs or
    /// products.
    ///
    /// Three sets rather than one, because the page carries two switches of its own: a company
    /// can publish its page and still choose not to advertise positions. Reading them together
    /// in one pass is also what keeps every route here to a fixed number of queries.
    /// </summary>
    private async Task<(HashSet<Guid> All, HashSet<Guid> WithJobs, HashSet<Guid> WithProducts)>
        PublishedTenantIdsAsync(CancellationToken ct)
    {
        var pages = await db.PublicPages.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.IsPublished)
            .Select(p => new { p.TenantId, p.ShowJobs, p.ShowProducts })
            .ToListAsync(ct);

        return (
            pages.Select(p => p.TenantId).ToHashSet(),
            pages.Where(p => p.ShowJobs).Select(p => p.TenantId).ToHashSet(),
            pages.Where(p => p.ShowProducts).Select(p => p.TenantId).ToHashSet());
    }

    /// <summary>The company behind a posting or a product, as the card names it.</summary>
    private sealed record CompanyRef(string Name, string Slug);

    private async Task<Dictionary<Guid, CompanyRef>> CompanyNamesAsync(
        IEnumerable<Guid> tenantIds, CancellationToken ct)
    {
        var ids = tenantIds.Distinct().ToList();
        if (ids.Count == 0) return [];

        var rows = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => ids.Contains(t.Id))
            .Select(t => new { t.Id, t.Name, t.Slug })
            .ToListAsync(ct);

        return rows.ToDictionary(r => r.Id, r => new CompanyRef(r.Name, r.Slug));
    }

    private static int Clamp(int pageSize) => pageSize <= 0 ? 24 : Math.Min(pageSize, MaxPageSize);

    private static PagedResult<T> Empty<T>(int page, int pageSize) => new()
    {
        Items = [],
        Page = Math.Max(1, page),
        PageSize = Clamp(pageSize),
        TotalCount = 0
    };
}
