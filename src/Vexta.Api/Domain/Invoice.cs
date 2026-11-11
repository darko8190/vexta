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

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<InvoiceLine> Lines { get; set; } = [];
}

public class InvoiceLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    public required string Description { get; set; }
    public decimal Quantity { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public decimal TaxRatePercent { get; set; }
    public int SortOrder { get; set; }
}
