namespace Vexta.Api.Domain;

public class Invoice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ClientId { get; set; }
    public Client? Client { get; set; }

    public Guid? ProjectId { get; set; }
    public Project? Project { get; set; }

    public required string Number { get; set; }
    public InvoiceStatus Status { get; set; } = InvoiceStatus.Brouillon;

    public DateOnly IssueDate { get; set; }
    public DateOnly DueDate { get; set; }
    public string Currency { get; set; } = "CAD";
    public string? Notes { get; set; }

    /// <summary>
    /// No tax on this invoice. Defaulted from the project, or from the client when there is no
    /// project, and then owned by the invoice. Every line's rate is forced to zero while it is
    /// set, so the stored lines and the printed total can never disagree.
    /// </summary>
    public bool IsTaxExempt { get; set; }

    /// <summary>
    /// Which margin the catalogue lines on this invoice were priced with. Taken from the
    /// project, or the company's default, and kept so a price can be explained months later.
    /// </summary>
    public Guid? PricePolicyId { get; set; }
    public PricePolicy? PricePolicy { get; set; }

    /// <summary>When it was emailed to the client, or null if it never was.</summary>
    public DateTimeOffset? SentAt { get; set; }

    /// <summary>
    /// What the "payer en ligne" link in the email carries, or null for an invoice that has
    /// never been sent with one.
    ///
    /// A token rather than the invoice's id, and a long random one, because this is the whole
    /// credential: anybody holding the link reads the invoice and may pay it. That is the point
    /// — the client was emailed the invoice and must not be made to open an account to settle
    /// it — but it means the link has to be unguessable, so it is 32 random bytes and not
    /// something anybody could arrive at by counting.
    ///
    /// Never expires. An invoice paid three months late is still that invoice, and a dead link
    /// turns a client who finally sat down to pay into a phone call.
    /// </summary>
    public string? PayToken { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<InvoiceLine> Lines { get; set; } = [];
}

public class InvoiceLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    public InvoiceLineKind Kind { get; set; } = InvoiceLineKind.Autre;

    /// <summary>
    /// The catalogue entry this line was taken from, for a material or a piece of equipment.
    /// Null for anything typed by hand, and SetNull when the product is deleted: the line is
    /// what was sold and must survive the catalogue being tidied up.
    /// </summary>
    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }

    public required string Description { get; set; }
    public decimal Quantity { get; set; } = 1;

    /// <summary>What it cost the company. Kept on the line so the margin on a sent invoice
    /// stays readable even after the product's own price has moved.</summary>
    public decimal? PurchasePrice { get; set; }

    /// <summary>In percent, applied the way the company's MarginMode says.</summary>
    public decimal? MarginPercent { get; set; }

    /// <summary>The selling price: what the client is charged per unit.</summary>
    public decimal UnitPrice { get; set; }

    /// <summary>
    /// Whether the company's two tax rates apply to this line. It replaced a per-line rate: the
    /// rates belong to the company, not to the line, and letting each line carry its own was an
    /// invitation to print an invoice whose taxes nobody could reconcile.
    /// </summary>
    public bool IsTaxable { get; set; } = true;

    public int SortOrder { get; set; }
}
