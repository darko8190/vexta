namespace Vexta.Api.Features.Products;

/// <summary>One of the company's own categories, with its sub-categories under it.</summary>
public record ProductCategoryDto(
    Guid Id,
    string Name,
    int ProductCount,
    IReadOnlyList<ProductSubCategoryDto> SubCategories);

public record ProductSubCategoryDto(Guid Id, Guid CategoryId, string Name, int ProductCount);

/// <summary>Both dropdowns add to their list from the form that uses them, so both take a name.</summary>
public record SaveCategoryRequest(string Name);

/// <summary>
/// A product as every screen reads it.
///
/// The three quantities travel together because they are only meaningful together: what is on
/// the shelf, what is already promised, and what can still be sold. Only the first is stored —
/// see the reserved calculation on the controller.
/// </summary>
public record ProductDto(
    Guid Id,
    int Number,
    string? Code,
    string Title,
    string? Description,
    string? Unit,
    Guid? CategoryId,
    string? CategoryName,
    Guid? SubCategoryId,
    string? SubCategoryName,
    string? Barcode,
    decimal? MinimumQuantity,
    decimal? MaximumQuantity,
    bool TracksInventory,
    decimal QuantityOnHand,
    decimal QuantityReserved,
    decimal QuantityAvailable,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    decimal? SellingPrice,
    int? InstallationMinutes,
    string? Note,
    Guid? ParentProductId,
    string? ParentTitle,
    int VariantCount,
    int ImageCount,
    bool IsPublic,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    /// <summary>
    /// Ordered from a supplier and not in yet: what is left to receive on every purchase order
    /// already sent. Computed on the way out, like the reserved quantity.
    /// </summary>
    decimal QuantityOnOrder = 0,
    /// <summary>Made by the company itself rather than bought.</summary>
    bool IsManufactured = false,
    /// <summary>Not sold itself: its variants are.</summary>
    bool IsParent = false);

/// <summary>
/// A photograph of the product, with a link that works right now. The URL is signed on the way
/// out and expires, which is why it is never stored: a kept link is a link that has stopped
/// working by the time anyone clicks it.
/// </summary>
public record ProductImageDto(
    Guid Id,
    Guid MediaAssetId,
    string FileName,
    string ContentType,
    string? Url,
    int SortOrder);

public record ProductPriceEntryDto(
    Guid Id,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    decimal? SellingPrice,
    string? ChangedByName,
    DateTimeOffset CreatedAt);

public record ProductStockEntryDto(
    Guid Id,
    decimal QuantityChange,
    decimal QuantityAfter,
    string? Reason,
    string? CreatedByName,
    DateTimeOffset CreatedAt);

/// <summary>
/// The badges on the product's own rail. Suppliers and purchases count zero rather than being
/// left out: the rail is what says what a product will carry, and a section that appears only
/// once it has content is a section nobody discovers.
/// </summary>
public record ProductSectionCountsDto(
    int Images,
    int Variants,
    int Suppliers,
    int StockEntries,
    int PriceEntries,
    int Purchases);

public record ProductSummaryDto(ProductSectionCountsDto Counts);

/// <summary>
/// A catalogue hit as the invoice line picker shows it. Deliberately small: the picker runs on
/// every keystroke and a line only needs what it is about to copy onto itself.
/// </summary>
/// <param name="Unit">
/// Carried even though the picker barely shows it: the line that picks a product copies the unit
/// onto itself, and a quantity of 12 has to be able to say twelve of what.
/// </param>
public record ProductSearchResultDto(
    Guid Id,
    int Number,
    string? Code,
    string Title,
    string? Unit,
    string? CategoryName,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    decimal? SellingPrice,
    bool TracksInventory,
    decimal QuantityAvailable);

/// <param name="QuantityOnHand">
/// What is on the shelf. On a correction the difference is written to the stock history rather
/// than applied silently, so the number on the page always has a movement behind it.
/// </param>
/// <param name="ParentProductId">Set to create this product as a variant of another one.</param>
/// <param name="Unit">
/// How the product is counted and sold: un, pi, pi², m, kg, h, sac. Free text, trimmed, and null
/// when left blank — a variant measures itself, so it carries its own rather than its parent's.
/// </param>
public record SaveProductRequest(
    string? Code,
    string Title,
    string? Description,
    string? Unit,
    Guid? CategoryId,
    Guid? SubCategoryId,
    string? Barcode,
    decimal? MinimumQuantity,
    decimal? MaximumQuantity,
    bool TracksInventory,
    decimal QuantityOnHand,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    decimal? SellingPrice,
    int? InstallationMinutes,
    string? Note,
    Guid? ParentProductId,
    bool IsPublic,
    bool IsManufactured = false,
    bool IsParent = false);

/// <param name="MediaAssetIds">
/// The photographs, in the order they should appear. It is the whole set every time: what is
/// sent replaces what the product had, so removing one is saving the list without it.
/// </param>
public record SaveProductImagesRequest(IReadOnlyList<Guid>? MediaAssetIds);

/// <param name="QuantityChange">Positive for what came in, negative for what left.</param>
public record ProductStockMovementRequest(decimal QuantityChange, string? Reason);

/// <summary>A product as the advanced search shows it: a picture, its filing and its prices.</summary>
public record ProductBrowseDto(
    Guid Id, int Number, string? Code, string Title, string? Unit, Guid? CategoryId, string? CategoryName,
    string? SubCategoryName, decimal? PurchasePrice, decimal? MarginPercent, decimal? SellingPrice,
    bool TracksInventory, decimal QuantityOnHand, string? ImageUrl);
