namespace Vexta.Api.Domain;

/// <summary>
/// Where an order from the shop window stands.
///
/// Five states, each of which means something different to the person waiting. Deliberately not
/// the purchase-order states: those describe the company buying from a supplier, and the two
/// directions have nothing to say to each other.
///
/// Stored as numbers, so new states are appended.
/// </summary>
public enum CustomerOrderStatus
{
    /// <summary>It arrived. Nobody at the company has looked at it yet.</summary>
    Recue = 0,

    /// <summary>Somebody is picking it.</summary>
    EnPreparation = 1,

    /// <summary>Waiting at the counter, or on its way.</summary>
    Prete = 2,

    /// <summary>The customer has it.</summary>
    Livree = 3,

    /// <summary>
    /// Cancelled, by either side. Kept rather than deleted: a customer who ordered and did not
    /// receive is a conversation, and a row that vanished is a conversation with no record.
    /// </summary>
    Annulee = 4
}

/// <summary>
/// An order somebody placed on a company's public page.
///
/// The opposite direction from <see cref="PurchaseOrder"/>, which is the company buying from a
/// supplier. Its own table and not a status on that one: the two share the word "commande" and
/// nothing else — different parties, different documents, different people reading them.
///
/// Nor is it a draft invoice. An order is what the customer asked for; an invoice is what the
/// company decided to charge. Collapsing them would mean a stranger on the internet could write
/// a row into the company's invoice book, and would leave nowhere to stand between "I would
/// like these three things" and "here is your bill".
///
/// What it holds is a snapshot. The description and the unit price are copied from the
/// catalogue at the moment of ordering, like an invoice line, because the catalogue moves and
/// what was agreed must not move with it.
/// </summary>
public class CustomerOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>
    /// Sequential within the company and never chosen by hand, like a client's or a product's.
    /// Shown as CMD-0001, which is what somebody reads out on the telephone.
    /// </summary>
    public int Number { get; set; }

    /// <summary>
    /// The customer's file in this company's space. Created on the first order from an account
    /// the company does not already know, because an order that belongs to nobody cannot become
    /// an invoice — which is the whole point of having it.
    /// </summary>
    public Guid ClientId { get; set; }
    public Client? Client { get; set; }

    /// <summary>
    /// The Vexta account that placed it. This is what lets somebody see their orders from every
    /// company in one place, and it is why ordering needs an account at all.
    /// </summary>
    public Guid PlacedByUserId { get; set; }
    public ApplicationUser? PlacedByUser { get; set; }

    /// <summary>
    /// Who to call about this order, copied at the time. Deliberately not read back through the
    /// client: somebody who moves house must not rewrite the address an order was delivered to
    /// last spring.
    /// </summary>
    public required string ContactName { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }

    /// <summary>What the customer wrote in the box. A delivery instruction, a question, a date.</summary>
    public string? Note { get; set; }

    public CustomerOrderStatus Status { get; set; } = CustomerOrderStatus.Recue;

    public string Currency { get; set; } = "CAD";

    /// <summary>Taken from the client's own file at the time, like an invoice's.</summary>
    public bool IsTaxExempt { get; set; }

    /// <summary>
    /// The company's two rates as they stood when the order was placed.
    ///
    /// Copied rather than read from the company's settings, which is the one place this differs
    /// from an invoice. An invoice is printed by the company and can be reprinted; an order is a
    /// figure a customer was shown and accepted, and a rate change next quarter must not quietly
    /// restate what they agreed to.
    /// </summary>
    public decimal GstRate { get; set; }
    public decimal QstRate { get; set; }

    /// <summary>
    /// The invoice made from this order, once the company made one. SetNull if that invoice is
    /// deleted: the order is still what was asked for.
    /// </summary>
    public Guid? InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<CustomerOrderLine> Lines { get; set; } = [];
}

/// <summary>
/// One thing on an order, as it was when it was ordered.
///
/// The same shape as an invoice line and for the same reasons: the description and the price are
/// copies, and the product is a pointer that may go null. What was sold has to survive the
/// catalogue being tidied up.
/// </summary>
public class CustomerOrderLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid OrderId { get; set; }
    public CustomerOrder? Order { get; set; }

    /// <summary>The catalogue entry it came from. SetNull once the product is deleted.</summary>
    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }

    public required string Description { get; set; }

    /// <summary>How it is counted, copied from the product: un, pi², sac.</summary>
    public string? Unit { get; set; }

    public decimal Quantity { get; set; } = 1;

    /// <summary>What the customer was shown per unit, at the moment they ordered.</summary>
    public decimal UnitPrice { get; set; }

    /// <summary>
    /// Whether the company's two rates apply. Always true today — a public price is a taxable
    /// sale — but carried on the line so an order and the invoice drawn from it have the same
    /// shape, and so an exemption can later be expressed where it belongs.
    /// </summary>
    public bool IsTaxable { get; set; } = true;

    public int SortOrder { get; set; }
}
