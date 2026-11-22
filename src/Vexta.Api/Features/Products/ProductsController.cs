using System.Linq.Expressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Products;

/// <summary>
/// The product catalogue.
///
/// Staff only, including for reading: a product carries what the company paid for it and the
/// margin it takes, and a customer with access to their own project has no business reading
/// either. What a visitor may see of the catalogue is the public page's business, not this one's.
/// </summary>
[ApiController]
[Route("api/products")]
[StaffOnly]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public class ProductsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IR2StorageService storage) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<ProductDto>>> List(
        [FromQuery] PagingQuery query,
        [FromQuery] Guid? categoryId,
        [FromQuery] Guid? subCategoryId,
        [FromQuery] bool? lowStock,
        [FromQuery] Guid? parentId,
        CancellationToken ct)
    {
        var products = db.Products.AsNoTracking().AsQueryable();

        // A variant belongs on its parent's page, not beside it in the catalogue: a product
        // sold in four lengths would otherwise fill the list with four near-identical rows and
        // bury everything else. Asking for a parent is asking for exactly those rows.
        products = parentId is { } parent
            ? products.Where(p => p.ParentProductId == parent)
            : products.Where(p => p.ParentProductId == null);

        if (categoryId is not null) products = products.Where(p => p.CategoryId == categoryId);
        if (subCategoryId is not null) products = products.Where(p => p.SubCategoryId == subCategoryId);

        if (lowStock == true)
        {
            // Nothing to be under for a product that is not counted, and nothing to be under
            // without a minimum either — both would answer "low" for every row.
            products = products.Where(p =>
                p.TracksInventory && p.MinimumQuantity != null && p.QuantityOnHand <= p.MinimumQuantity);
        }

        products = Matching(products, query.Search);

        var totalCount = await products.CountAsync(ct);

        var items = await products
            .OrderBy(p => p.Title)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(ToDto())
            .ToListAsync(ct);

        return Ok(new PagedResult<ProductDto>
        {
            Items = await WithReservedAsync(items, ct),
            Page = query.Page,
            PageSize = query.PageSize,
            TotalCount = totalCount
        });
    }

    /// <summary>
    /// The catalogue as the invoice line picker searches it: a few columns, matched on anything
    /// someone would have in front of them — the name, the company's own code, the barcode as
    /// scanned, or the article number read off a shelf label.
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<List<ProductSearchResultDto>>> Search(
        [FromQuery] string? term, [FromQuery] int take, CancellationToken ct)
    {
        var limit = take is > 0 and <= 50 ? take : 20;

        var items = await Matching(db.Products.AsNoTracking(), term)
            .OrderBy(p => p.Title)
            .Take(limit)
            .Select(p => new
            {
                p.Id,
                p.Number,
                p.Code,
                p.Title,
                p.Unit,
                CategoryName = p.Category == null ? null : p.Category.Name,
                p.PurchasePrice,
                p.MarginPercent,
                p.SellingPrice,
                p.TracksInventory,
                p.QuantityOnHand
            })
            .ToListAsync(ct);

        var reserved = await ReservedAsync(items.Select(i => i.Id).ToList(), ct);

        return Ok(items.ConvertAll(i => new ProductSearchResultDto(
            i.Id,
            i.Number,
            i.Code,
            i.Title,
            i.Unit,
            i.CategoryName,
            i.PurchasePrice,
            i.MarginPercent,
            i.SellingPrice,
            i.TracksInventory,
            i.QuantityOnHand - reserved.GetValueOrDefault(i.Id))));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductDto>> Get(Guid id, CancellationToken ct)
    {
        var product = await GetDtoAsync(id, ct);
        return product is null ? NotFound() : Ok(product);
    }

    /// <summary>What the product's own page needs for its rail: how many rows sit behind each tab.</summary>
    [HttpGet("{id:guid}/summary")]
    public async Task<ActionResult<ProductSummaryDto>> Summary(Guid id, CancellationToken ct)
    {
        var counts = await db.Products.AsNoTracking()
            .Where(p => p.Id == id)
            // Suppliers and purchases have no records yet and count zero rather than being left
            // out, so the rail says what a product will carry.
            .Select(p => new ProductSectionCountsDto(
                p.Images.Count,
                p.Variants.Count,
                0,
                p.StockHistory.Count,
                p.PriceHistory.Count,
                0))
            .FirstOrDefaultAsync(ct);

        return counts is null ? NotFound() : Ok(new ProductSummaryDto(counts));
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProductDto>> Create(SaveProductRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (await ProblemAsync(request, ct) is { } problem) return BadRequest(new { message = problem });

        var mode = await MarginModeAsync(ct);
        var (purchasePrice, marginPercent, sellingPrice) = Price(request, mode);

        var product = new Product
        {
            TenantId = tenantId,
            Number = await NextNumberAsync(tenantId, ct),
            Code = Clean(request.Code),
            Title = request.Title.Trim(),
            Description = Clean(request.Description),
            Unit = Clean(request.Unit),
            CategoryId = request.CategoryId,
            SubCategoryId = request.SubCategoryId,
            Barcode = Clean(request.Barcode),
            MinimumQuantity = request.MinimumQuantity,
            MaximumQuantity = request.MaximumQuantity,
            TracksInventory = request.TracksInventory,
            QuantityOnHand = request.QuantityOnHand,
            PurchasePrice = purchasePrice,
            MarginPercent = marginPercent,
            SellingPrice = sellingPrice,
            InstallationMinutes = request.InstallationMinutes,
            Note = Clean(request.Note),
            ParentProductId = request.ParentProductId,
            IsPublic = request.IsPublic
        };

        db.Products.Add(product);

        if (purchasePrice is not null || marginPercent is not null || sellingPrice is not null)
        {
            AddPriceEntry(product, tenantId);
        }

        // The quantity typed on the form is a movement like any other, so the history starts
        // with it rather than with a figure nobody can account for.
        if (product.QuantityOnHand != 0m)
        {
            AddStockEntry(product, tenantId, product.QuantityOnHand, "Quantité initiale");
        }

        await db.SaveChangesAsync(ct);

        var dto = await GetDtoAsync(product.Id, ct);
        return CreatedAtAction(nameof(Get), new { id = product.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProductDto>> Update(Guid id, SaveProductRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();
        if (await ProblemAsync(request, ct, id) is { } problem) return BadRequest(new { message = problem });

        var mode = await MarginModeAsync(ct);
        var (purchasePrice, marginPercent, sellingPrice) = Price(request, mode);

        var pricesMoved = product.PurchasePrice != purchasePrice
            || product.MarginPercent != marginPercent
            || product.SellingPrice != sellingPrice;

        product.Code = Clean(request.Code);
        product.Title = request.Title.Trim();
        product.Description = Clean(request.Description);
        product.Unit = Clean(request.Unit);
        product.CategoryId = request.CategoryId;
        product.SubCategoryId = request.SubCategoryId;
        product.Barcode = Clean(request.Barcode);
        product.MinimumQuantity = request.MinimumQuantity;
        product.MaximumQuantity = request.MaximumQuantity;
        product.TracksInventory = request.TracksInventory;
        product.PurchasePrice = purchasePrice;
        product.MarginPercent = marginPercent;
        product.SellingPrice = sellingPrice;
        product.InstallationMinutes = request.InstallationMinutes;
        product.Note = Clean(request.Note);
        product.ParentProductId = request.ParentProductId;
        product.IsPublic = request.IsPublic;
        product.UpdatedAt = DateTimeOffset.UtcNow;

        // The form carries the quantity, so an edit can move it. The difference is written as a
        // movement rather than applied quietly: a stock figure with no entry behind it is the
        // one number in the history nobody can explain.
        var difference = request.QuantityOnHand - product.QuantityOnHand;
        if (difference != 0m)
        {
            product.QuantityOnHand = request.QuantityOnHand;
            AddStockEntry(product, tenantId, difference, "Correction depuis la fiche");
        }

        if (pricesMoved) AddPriceEntry(product, tenantId);

        await db.SaveChangesAsync(ct);
        return Ok(await GetDtoAsync(id, ct));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();

        // Refused with the count rather than cascading: the variants hold real stock of their
        // own, and taking them out with their parent is not what anyone meant by deleting one
        // catalogue entry.
        var variants = await db.Products.CountAsync(p => p.ParentProductId == id, ct);
        if (variants > 0)
        {
            return Conflict(new
            {
                message = variants == 1
                    ? "Ce produit a une variante. Supprimez-la d'abord."
                    : $"Ce produit a {variants} variantes. Supprimez-les d'abord."
            });
        }

        db.Products.Remove(product);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/variants")]
    public async Task<ActionResult<List<ProductDto>>> Variants(Guid id, CancellationToken ct)
    {
        if (!await db.Products.AnyAsync(p => p.Id == id, ct)) return NotFound();

        var items = await db.Products.AsNoTracking()
            .Where(p => p.ParentProductId == id)
            .OrderBy(p => p.Title)
            .Select(ToDto())
            .ToListAsync(ct);

        return Ok(await WithReservedAsync(items, ct));
    }

    [HttpGet("{id:guid}/images")]
    public async Task<ActionResult<List<ProductImageDto>>> Images(Guid id, CancellationToken ct)
    {
        if (!await db.Products.AnyAsync(p => p.Id == id, ct)) return NotFound();
        return Ok(await ImagesAsync(id, ct));
    }

    [HttpPost("{id:guid}/images")]
    [RequireBusinessTenant]
    public async Task<ActionResult<List<ProductImageDto>>> SaveImages(
        Guid id, SaveProductImagesRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var product = await db.Products.Include(p => p.Images).FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();

        var ids = (request.MediaAssetIds ?? []).Distinct().ToList();

        // Checked against this tenant's own library — the query filter is what makes a foreign
        // id simply not exist here, rather than something that can be pinned to a product and
        // then read through it.
        var known = await db.MediaAssets.AsNoTracking()
            .Where(m => ids.Contains(m.Id))
            .Select(m => m.Id)
            .ToListAsync(ct);

        if (known.Count != ids.Count)
        {
            return BadRequest(new { message = "Une des images téléversées est introuvable." });
        }

        db.ProductImages.RemoveRange(product.Images);
        product.Images.Clear();

        // Added through the DbSet rather than onto the parent's collection, which looks like a
        // detail and is not: these rows carry a client-generated Guid key, and EF reads a key
        // that is already set as "this row exists". Reached through a navigation it was marked
        // Modified instead of Added, so the save issued an UPDATE for a line that had never
        // been inserted — nought rows affected, and the whole request failed with a
        // concurrency error. Add() states the intent and leaves nothing to infer.
        db.ProductImages.AddRange(ids.Select((assetId, index) => new ProductImage
        {
            TenantId = tenantId,
            ProductId = product.Id,
            MediaAssetId = assetId,
            SortOrder = index
        }));

        product.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(await ImagesAsync(id, ct));
    }

    [HttpGet("{id:guid}/stock")]
    public async Task<ActionResult<List<ProductStockEntryDto>>> Stock(Guid id, CancellationToken ct)
    {
        if (!await db.Products.AnyAsync(p => p.Id == id, ct)) return NotFound();

        var items = await db.ProductStockEntries.AsNoTracking()
            .Where(h => h.ProductId == id)
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new ProductStockEntryDto(
                h.Id,
                h.QuantityChange,
                h.QuantityAfter,
                h.Reason,
                db.Users.Where(u => u.Id == h.CreatedById)
                    .Select(u => u.FirstName + " " + u.LastName)
                    .FirstOrDefault(),
                h.CreatedAt))
            .ToListAsync(ct);

        return Ok(items);
    }

    /// <summary>
    /// A delivery, a count, a correction. The movement and the new quantity on the shelf are
    /// saved together: two SaveChanges would make it possible to have one without the other.
    /// </summary>
    [HttpPost("{id:guid}/stock")]
    [RequireBusinessTenant]
    public async Task<ActionResult<List<ProductStockEntryDto>>> AddStock(
        Guid id, ProductStockMovementRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();

        if (request.QuantityChange == 0m)
        {
            return BadRequest(new { message = "Indiquez une quantité autre que zéro." });
        }

        if (request.Reason is { Length: > 200 })
        {
            return BadRequest(new { message = "La raison est trop longue." });
        }

        product.QuantityOnHand += request.QuantityChange;
        product.UpdatedAt = DateTimeOffset.UtcNow;
        AddStockEntry(product, tenantId, request.QuantityChange, Clean(request.Reason));

        await db.SaveChangesAsync(ct);
        return await Stock(id, ct);
    }

    [HttpGet("{id:guid}/prices")]
    public async Task<ActionResult<List<ProductPriceEntryDto>>> Prices(Guid id, CancellationToken ct)
    {
        if (!await db.Products.AnyAsync(p => p.Id == id, ct)) return NotFound();

        var items = await db.ProductPriceEntries.AsNoTracking()
            .Where(h => h.ProductId == id)
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new ProductPriceEntryDto(
                h.Id,
                h.PurchasePrice,
                h.MarginPercent,
                h.SellingPrice,
                db.Users.Where(u => u.Id == h.ChangedById)
                    .Select(u => u.FirstName + " " + u.LastName)
                    .FirstOrDefault(),
                h.CreatedAt))
            .ToListAsync(ct);

        return Ok(items);
    }

    /// <summary>
    /// What someone would have in front of them: the name, the company's own code, the barcode
    /// as scanned, or the article number — typed either as 12 or as A-0012, which is how it is
    /// read off a label.
    /// </summary>
    private static IQueryable<Product> Matching(IQueryable<Product> products, string? search)
    {
        if (string.IsNullOrWhiteSpace(search)) return products;

        var term = search.Trim();
        var digits = new string(term.Where(char.IsDigit).ToArray());
        var number = int.TryParse(digits, out var parsed) ? parsed : (int?)null;

        // ILike, not Contains: Contains becomes a case-sensitive LIKE on Postgres, so typing
        // "bardeau" found nothing while "Bardeau" did. Nobody searches a catalogue in the case
        // the catalogue was typed in.
        var pattern = $"%{term}%";

        return products.Where(p =>
            EF.Functions.ILike(p.Title, pattern)
            || (p.Code != null && EF.Functions.ILike(p.Code, pattern))
            || (p.Barcode != null && EF.Functions.ILike(p.Barcode, pattern))
            || (number != null && p.Number == number));
    }

    /// <summary>
    /// Max + 1, not count + 1: deleting a product must not hand its number to the next one.
    /// The unique index is what makes a simultaneous creation fail rather than collide silently.
    /// </summary>
    private async Task<int> NextNumberAsync(Guid tenantId, CancellationToken ct)
    {
        var highest = await db.Products.IgnoreQueryFilters()
            .Where(p => p.TenantId == tenantId)
            .MaxAsync(p => (int?)p.Number, ct) ?? 0;

        return highest + 1;
    }

    /// <summary>
    /// The company's margin convention. Missing settings mean the company has not said yet, and
    /// markup on cost is what a contractor means by "la marge" when nobody has asked them.
    /// </summary>
    private async Task<MarginMode> MarginModeAsync(CancellationToken ct) =>
        await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == currentUser.TenantId)
            .Select(b => (MarginMode?)b.MarginMode)
            .FirstOrDefaultAsync(ct) ?? MarginMode.Multiplication;

    /// <summary>
    /// The three figures, with the missing one worked out from the other two. A price that was
    /// typed by hand is never overwritten: a figure rounded to something sellable is the price,
    /// and the margin is then whatever it is.
    /// </summary>
    private static (decimal? Purchase, decimal? Margin, decimal? Selling) Price(
        SaveProductRequest request, MarginMode mode)
    {
        var purchase = request.PurchasePrice;
        var margin = request.MarginPercent;
        var selling = request.SellingPrice;

        if (selling is null && purchase is not null && margin is not null)
        {
            selling = Pricing.SellingPrice(purchase, margin, mode);
        }
        else if (margin is null && purchase is not null && selling is not null)
        {
            margin = Pricing.MarginPercent(purchase, selling, mode);
        }

        return (purchase, margin, selling);
    }

    private async Task<string?> ProblemAsync(SaveProductRequest request, CancellationToken ct, Guid? id = null)
    {
        if (string.IsNullOrWhiteSpace(request.Title)) return "Le titre est obligatoire.";
        if (request.Title.Trim().Length > 200) return "Le titre est trop long.";
        if (request.Code is { Length: > 60 }) return "Le code est trop long.";
        if (request.Barcode is { Length: > 64 }) return "Le code à barres est trop long.";

        // 20, like the column: an abbreviation is what a unit is, and anything longer is a
        // sentence that would be truncated by the database rather than refused here.
        if (request.Unit is { Length: > 20 }) return "L'unité est trop longue.";

        if (request.PurchasePrice is < 0 || request.SellingPrice is < 0)
        {
            return "Un prix ne peut pas être négatif.";
        }

        if (request.MinimumQuantity is < 0 || request.MaximumQuantity is < 0)
        {
            return "Une quantité ne peut pas être négative.";
        }

        if (request.MinimumQuantity is { } min && request.MaximumQuantity is { } max && min > max)
        {
            return "Le minimum ne peut pas dépasser le maximum.";
        }

        if (request.InstallationMinutes is < 0) return "Le temps d'installation ne peut pas être négatif.";

        if (request.CategoryId is { } categoryId)
        {
            if (!await db.ProductCategories.AnyAsync(c => c.Id == categoryId, ct))
            {
                return "Cette catégorie n'existe pas.";
            }

            if (request.SubCategoryId is { } subCategoryId
                && !await db.ProductSubCategories.AnyAsync(s => s.Id == subCategoryId && s.CategoryId == categoryId, ct))
            {
                return "Cette sous-catégorie n'appartient pas à la catégorie choisie.";
            }
        }
        else if (request.SubCategoryId is not null)
        {
            return "Choisissez une catégorie avant une sous-catégorie.";
        }

        if (request.ParentProductId is { } parentId)
        {
            if (parentId == id) return "Un produit ne peut pas être sa propre variante.";

            var parent = await db.Products.AsNoTracking()
                .Where(p => p.Id == parentId)
                .Select(p => new { p.ParentProductId })
                .FirstOrDefaultAsync(ct);

            if (parent is null) return "Le produit parent est introuvable.";

            // One level, deliberately: a variant of a variant is a tree nobody can read off a
            // shelf label, and every screen would have to decide how deep to walk it.
            if (parent.ParentProductId is not null)
            {
                return "Une variante ne peut pas avoir ses propres variantes.";
            }
        }

        return null;
    }

    private void AddPriceEntry(Product product, Guid tenantId) =>
        db.ProductPriceEntries.Add(new ProductPriceEntry
        {
            TenantId = tenantId,
            ProductId = product.Id,
            PurchasePrice = product.PurchasePrice,
            MarginPercent = product.MarginPercent,
            SellingPrice = product.SellingPrice,
            ChangedById = currentUser.UserId
        });

    private void AddStockEntry(Product product, Guid tenantId, decimal change, string? reason) =>
        db.ProductStockEntries.Add(new ProductStockEntry
        {
            TenantId = tenantId,
            ProductId = product.Id,
            QuantityChange = change,
            // Stored with the movement so the history reads without replaying every row above it.
            QuantityAfter = product.QuantityOnHand,
            Reason = reason,
            CreatedById = currentUser.UserId
        });

    private async Task<ProductDto?> GetDtoAsync(Guid id, CancellationToken ct)
    {
        var dto = await db.Products.AsNoTracking()
            .Where(p => p.Id == id)
            .Select(ToDto())
            .FirstOrDefaultAsync(ct);

        if (dto is null) return null;

        var reserved = await ReservedAsync([id], ct);
        return Reserve(dto, reserved.GetValueOrDefault(id));
    }

    private async Task<List<ProductDto>> WithReservedAsync(List<ProductDto> items, CancellationToken ct)
    {
        if (items.Count == 0) return items;

        var reserved = await ReservedAsync(items.ConvertAll(i => i.Id), ct);
        return items.ConvertAll(i => Reserve(i, reserved.GetValueOrDefault(i.Id)));
    }

    private static ProductDto Reserve(ProductDto dto, decimal reserved) =>
        dto with { QuantityReserved = reserved, QuantityAvailable = dto.QuantityOnHand - reserved };

    /// <summary>
    /// What is promised but not yet gone: the quantity on every material or equipment line of an
    /// invoice that has not been settled. Computed on the way out rather than stored, because a
    /// stored reservation is a number that drifts the first time someone edits an invoice.
    ///
    /// Provisional: once a project carries its own material lines, those reserve stock too, and
    /// this sum has to grow to include them. Invoices are the only thing that commits a product
    /// today.
    /// </summary>
    private async Task<Dictionary<Guid, decimal>> ReservedAsync(List<Guid> productIds, CancellationToken ct)
    {
        if (productIds.Count == 0) return [];

        return await db.InvoiceLines.AsNoTracking()
            .Where(l => l.ProductId != null
                && productIds.Contains(l.ProductId.Value)
                && (l.Kind == InvoiceLineKind.Materiaux || l.Kind == InvoiceLineKind.Equipement)
                && (l.Invoice!.Status == InvoiceStatus.Brouillon || l.Invoice!.Status == InvoiceStatus.Envoyee))
            .GroupBy(l => l.ProductId!.Value)
            .Select(g => new { ProductId = g.Key, Quantity = g.Sum(l => l.Quantity) })
            .ToDictionaryAsync(x => x.ProductId, x => x.Quantity, ct);
    }

    /// <summary>
    /// The photographs with a link each. A link that cannot be signed comes back null rather
    /// than failing the request: the product and its prices are still worth showing when the
    /// file storage is unreachable or has never been configured.
    /// </summary>
    private async Task<List<ProductImageDto>> ImagesAsync(Guid productId, CancellationToken ct)
    {
        var rows = await db.ProductImages.AsNoTracking()
            .Where(i => i.ProductId == productId)
            .OrderBy(i => i.SortOrder)
            .Select(i => new
            {
                i.Id,
                i.MediaAssetId,
                i.SortOrder,
                i.MediaAsset!.FileName,
                i.MediaAsset!.ContentType,
                i.MediaAsset!.ObjectKey
            })
            .ToListAsync(ct);

        var images = new List<ProductImageDto>(rows.Count);

        foreach (var row in rows)
        {
            string? url = null;
            try
            {
                url = await storage.CreateDownloadUrlAsync(row.ObjectKey, row.FileName, ct);
            }
            catch (InvalidOperationException)
            {
                // Storage is not configured, or its credentials are wrong. Said once by the
                // page, not once per photograph.
            }

            images.Add(new ProductImageDto(
                row.Id, row.MediaAssetId, row.FileName, row.ContentType, url, row.SortOrder));
        }

        return images;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static Expression<Func<Product, ProductDto>> ToDto() => p => new ProductDto(
        p.Id,
        p.Number,
        p.Code,
        p.Title,
        p.Description,
        p.Unit,
        p.CategoryId,
        p.Category == null ? null : p.Category.Name,
        p.SubCategoryId,
        p.SubCategory == null ? null : p.SubCategory.Name,
        p.Barcode,
        p.MinimumQuantity,
        p.MaximumQuantity,
        p.TracksInventory,
        p.QuantityOnHand,
        // Filled in once the reservations have been counted, which takes a query of its own.
        0m,
        p.QuantityOnHand,
        p.PurchasePrice,
        p.MarginPercent,
        p.SellingPrice,
        p.InstallationMinutes,
        p.Note,
        p.ParentProductId,
        p.ParentProduct == null ? null : p.ParentProduct.Title,
        p.Variants.Count,
        p.Images.Count,
        p.IsPublic,
        p.CreatedAt,
        p.UpdatedAt);
}
