namespace Vexta.Api.Domain;

/// <summary>
/// Something the company stocks, installs or resells.
///
/// A variant is a product in its own right — its own code, its own quantity, its own price —
/// that happens to point at a parent. Modelling it as a separate table would mean maintaining
/// two of everything and discovering, the first time someone sells a variant, that half the
/// application cannot see it.
/// </summary>
public class Product : ISoftDeletable
{
    // ---- Corbeille ----
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }

    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>
    /// Sequential within the tenant and never chosen by hand, like a client's or a project's.
    /// Shown as A-0001 — the article number, which is what a counter clerk reads out.
    /// </summary>
    public int Number { get; set; }

    /// <summary>The company's own reference, which is rarely our number.</summary>
    public string? Code { get; set; }

    public required string Title { get; set; }
    public string? Description { get; set; }

    /// <summary>
    /// How it is counted and sold: un, pi, pi², m, kg, h, sac. Free text rather than a list,
    /// because every trade measures differently and the unit is printed, not calculated with —
    /// forcing a shared vocabulary here would only make people pick the nearest wrong one.
    /// </summary>
    public string? Unit { get; set; }

    public Guid? CategoryId { get; set; }
    public ProductCategory? Category { get; set; }

    public Guid? SubCategoryId { get; set; }
    public ProductSubCategory? SubCategory { get; set; }

    /// <summary>The code printed on the box, as scanned. Shown as a barcode on the product's page.</summary>
    public string? Barcode { get; set; }

    /// <summary>When to reorder, and how much is too much to hold.</summary>
    public decimal? MinimumQuantity { get; set; }
    public decimal? MaximumQuantity { get; set; }

    /// <summary>
    /// False for something counted by the truckload or billed by the metre — sand, wire, labour
    /// in a box. The quantities below are then meaningless and the screens say so rather than
    /// showing a confident zero.
    /// </summary>
    public bool TracksInventory { get; set; } = true;

    /// <summary>What is on the shelf. Changed through stock entries, never typed over blindly.</summary>
    public decimal QuantityOnHand { get; set; }

    public decimal? PurchasePrice { get; set; }

    /// <summary>
    /// In percent, applied the way the company's <see cref="MarginMode"/> says. Kept alongside
    /// the selling price rather than replacing it: a price can be rounded to something sellable
    /// and the margin is then whatever it is.
    /// </summary>
    public decimal? MarginPercent { get; set; }

    public decimal? SellingPrice { get; set; }

    /// <summary>How long it takes to install, in minutes. What an estimate is built from.</summary>
    public int? InstallationMinutes { get; set; }

    public string? Note { get; set; }

    /// <summary>Null for a product; the product this one is a variant of otherwise.</summary>
    public Guid? ParentProductId { get; set; }
    public Product? ParentProduct { get; set; }
    public List<Product> Variants { get; set; } = [];

    /// <summary>Shown on the company's public page, where it can be sold.</summary>
    public bool IsPublic { get; set; }

    /// <summary>Made by the company itself, on its own production line, rather than bought.</summary>
    public bool IsManufactured { get; set; }

    /// <summary>
    /// A product that is not sold itself: its variants are. Holds what they share (the name,
    /// the category, the pictures) and carries no stock of its own. Only a parent has variants.
    /// </summary>
    public bool IsParent { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ProductImage> Images { get; set; } = [];
    public List<ProductPriceEntry> PriceHistory { get; set; } = [];
    public List<ProductStockEntry> StockHistory { get; set; } = [];
}

/// <summary>One of the company's own categories. Added from the dropdown that uses it.</summary>
public class ProductCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public required string Name { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ProductSubCategory> SubCategories { get; set; } = [];
    public List<Product> Products { get; set; } = [];
}

/// <summary>
/// A sub-category, which belongs to one category. Kept under its parent so the second dropdown
/// can be narrowed by the first instead of listing every sub-category the company has ever made.
/// </summary>
public class ProductSubCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid CategoryId { get; set; }
    public ProductCategory? Category { get; set; }

    public required string Name { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Product> Products { get; set; } = [];
}

/// <summary>A photograph of the product. The bytes live in R2 through <see cref="MediaAsset"/>.</summary>
public class ProductImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    public Guid MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// What the product cost and sold for, as of a moment. Written whenever one of the three figures
/// changes, so "it used to be cheaper" is a question with an answer.
/// </summary>
public class ProductPriceEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    public decimal? PurchasePrice { get; set; }
    public decimal? MarginPercent { get; set; }
    public decimal? SellingPrice { get; set; }

    public Guid? ChangedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A movement of stock: a delivery, a count, a correction. The quantity after the movement is
/// stored with it, so the history reads without having to replay every row before it.
/// </summary>
public class ProductStockEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProductId { get; set; }
    public Product? Product { get; set; }

    /// <summary>Positive for what came in, negative for what left.</summary>
    public decimal QuantityChange { get; set; }

    /// <summary>What was on the shelf once this movement was applied.</summary>
    public decimal QuantityAfter { get; set; }

    /// <summary>Why, in the company's own words: "réception Patrick Morin", "inventaire annuel".</summary>
    public string? Reason { get; set; }

    public Guid? CreatedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
