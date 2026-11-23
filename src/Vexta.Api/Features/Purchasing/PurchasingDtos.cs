using Vexta.Api.Common;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Purchasing;

// ---- Fournisseurs ----

public record SupplierDto(
    Guid Id,
    string Name,
    string? ContactName,
    string? Email,
    string? Phone,
    string? Website,
    string? AccountNumber,
    string? Line1,
    string? City,
    string? Province,
    string? PostalCode,
    string? Notes,
    bool IsActive,
    /// <summary>How many orders have been placed with them, open or not.</summary>
    int OrderCount,
    /// <summary>Orders placed but not fully received. The number somebody is chasing.</summary>
    int OpenOrderCount);

public record SaveSupplierRequest(
    string Name,
    string? ContactName,
    string? Email,
    string? Phone,
    string? Website,
    string? AccountNumber,
    string? Line1,
    string? City,
    string? Province,
    string? PostalCode,
    string? Notes,
    bool IsActive);

// ---- Commandes ----

public record PurchaseOrderLineDto(
    Guid Id,
    Guid? ProductId,
    string Description,
    string? Unit,
    decimal Quantity,
    decimal UnitCost,
    decimal Total,
    /// <summary>Added up from every delivery against this line.</summary>
    decimal QuantityReceived,
    int SortOrder);

public record PurchaseOrderDto(
    Guid Id,
    int Number,
    Guid SupplierId,
    string SupplierName,
    Guid? ProjectId,
    int? ProjectNumber,
    string? ProjectDescription,
    PurchaseOrderStatus Status,
    DateOnly OrderedOn,
    DateOnly? ExpectedOn,
    string? Reference,
    string? Note,
    /// <summary>Before tax. What the supplier's invoice should come to.</summary>
    decimal Total,
    int LineCount,
    int ReceiptCount,
    DateTimeOffset CreatedAt);

public record PurchaseOrderDetailDto(PurchaseOrderDto Order, IReadOnlyList<PurchaseOrderLineDto> Lines);

public record SavePurchaseOrderLineRequest(
    /// <summary>Null for a line being added. An id that is not on the order is refused.</summary>
    Guid? Id,
    Guid? ProductId,
    string Description,
    string? Unit,
    decimal Quantity,
    decimal UnitCost);

/// <param name="Lines">
/// The whole set every time: what is sent replaces what the order had. Omitted leaves the lines
/// alone, which is what the status-only saves do.
/// </param>
public record SavePurchaseOrderRequest(
    Guid SupplierId,
    Guid? ProjectId,
    DateOnly? OrderedOn,
    DateOnly? ExpectedOn,
    string? Reference,
    string? Note,
    IReadOnlyList<SavePurchaseOrderLineRequest>? Lines);

/// <summary>Sending or cancelling. Received is never set by hand — deliveries decide it.</summary>
public record SetPurchaseOrderStatusRequest(PurchaseOrderStatus Status);

// ---- Réceptions ----

public record GoodsReceiptLineDto(
    Guid Id,
    Guid PurchaseOrderLineId,
    string Description,
    string? Unit,
    decimal Quantity);

public record GoodsReceiptDto(
    Guid Id,
    Guid PurchaseOrderId,
    int OrderNumber,
    Guid SupplierId,
    string SupplierName,
    DateOnly ReceivedOn,
    string? SlipNumber,
    string? Note,
    int LineCount,
    DateTimeOffset CreatedAt);

public record GoodsReceiptDetailDto(GoodsReceiptDto Receipt, IReadOnlyList<GoodsReceiptLineDto> Lines);

public record SaveGoodsReceiptLineRequest(Guid PurchaseOrderLineId, decimal Quantity);

public record SaveGoodsReceiptRequest(
    Guid PurchaseOrderId,
    DateOnly? ReceivedOn,
    string? SlipNumber,
    string? Note,
    IReadOnlyList<SaveGoodsReceiptLineRequest> Lines);

/// <summary>
/// What is still owed on an order, line by line. Read before writing a delivery so the form
/// opens with what is actually outstanding rather than with the quantities first ordered.
/// </summary>
public record OutstandingLineDto(
    Guid PurchaseOrderLineId,
    string Description,
    string? Unit,
    decimal Ordered,
    decimal Received,
    decimal Outstanding);
