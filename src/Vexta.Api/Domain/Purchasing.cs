namespace Vexta.Api.Domain;

/// <summary>
/// Somebody the company buys from. A yard, a wholesaler, a rental shop.
///
/// Deliberately thin. What matters about a supplier is how to reach them and what has been
/// ordered from them, and a card with twenty empty fields on it is a card nobody fills in.
/// </summary>
public class Supplier
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Name { get; set; }

    /// <summary>The person answering the phone there.</summary>
    public string? ContactName { get; set; }

    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Website { get; set; }

    /// <summary>The company's account number with them, as it appears on their invoices.</summary>
    public string? AccountNumber { get; set; }

    public string? Line1 { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string? PostalCode { get; set; }

    public string? Notes { get; set; }

    /// <summary>
    /// False hides them from the pickers without deleting them. A supplier who closed still has
    /// to appear on the orders that were placed with them.
    /// </summary>
    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<PurchaseOrder> Orders { get; set; } = [];
}

/// <summary>Where an order stands. Computed from the receipts for the two middle values.</summary>
public enum PurchaseOrderStatus
{
    /// <summary>Being written. Nothing has been sent and nothing is expected.</summary>
    Brouillon = 0,

    /// <summary>Placed with the supplier, nothing received yet.</summary>
    Envoyee = 1,

    /// <summary>Some of it arrived.</summary>
    PartiellementRecue = 2,

    /// <summary>Everything ordered has arrived.</summary>
    Recue = 3,

    Annulee = 4
}

/// <summary>
/// An order placed with a supplier.
///
/// The number is per company and max + 1, the same rule as a project: deleting one must not
/// hand its number to the next, because the number is what the supplier has written down too.
/// </summary>
public class PurchaseOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public int Number { get; set; }

    public Guid SupplierId { get; set; }
    public Supplier? Supplier { get; set; }

    /// <summary>
    /// The job it was bought for, when it was bought for one. Null for stock: a pallet of
    /// screws going on the shelf belongs to nobody in particular.
    /// </summary>
    public Guid? ProjectId { get; set; }
    public Project? Project { get; set; }

    public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Brouillon;

    public DateOnly OrderedOn { get; set; }

    /// <summary>What the supplier promised. Null when they would not say.</summary>
    public DateOnly? ExpectedOn { get; set; }

    /// <summary>Their quote or confirmation number.</summary>
    public string? Reference { get; set; }

    public string? Note { get; set; }

    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<PurchaseOrderLine> Lines { get; set; } = [];
    public List<GoodsReceipt> Receipts { get; set; } = [];
}

/// <summary>
/// One thing ordered.
///
/// <see cref="ProductId"/> is optional because half of what gets ordered is not in the catalogue
/// and never will be — a specific beam, a delivery charge, a day of rental. The description is
/// what is required, and it is copied rather than read through the product so that renaming a
/// product later does not rewrite an order the supplier already filled.
/// </summary>
public class PurchaseOrderLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid PurchaseOrderId { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }

    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }

    public required string Description { get; set; }

    /// <summary>What it is counted in — "ch", "pi", "kg". Free text, like everywhere else.</summary>
    public string? Unit { get; set; }

    public decimal Quantity { get; set; }

    /// <summary>Before tax, per unit.</summary>
    public decimal UnitCost { get; set; }

    public int SortOrder { get; set; }

    public List<GoodsReceiptLine> ReceiptLines { get; set; } = [];

    public decimal Total => Quantity * UnitCost;
}

/// <summary>
/// A delivery against an order. Several per order: what was ordered rarely all turns up on the
/// same truck, and a single "received" flag cannot say that the beams came and the brackets
/// did not.
/// </summary>
public class GoodsReceipt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid PurchaseOrderId { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }

    public DateOnly ReceivedOn { get; set; }

    /// <summary>Their packing slip number.</summary>
    public string? SlipNumber { get; set; }

    public string? Note { get; set; }

    public Guid? ReceivedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<GoodsReceiptLine> Lines { get; set; } = [];
}

/// <summary>How much of one ordered line arrived on one delivery.</summary>
public class GoodsReceiptLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid GoodsReceiptId { get; set; }
    public GoodsReceipt? GoodsReceipt { get; set; }

    public Guid PurchaseOrderLineId { get; set; }
    public PurchaseOrderLine? PurchaseOrderLine { get; set; }

    /// <summary>
    /// Always positive, and allowed to overshoot what was ordered: suppliers send a full box
    /// rather than the eleven that were asked for, and refusing to record that would mean the
    /// shelf and the screen disagree from the first delivery.
    /// </summary>
    public decimal Quantity { get; set; }
}
