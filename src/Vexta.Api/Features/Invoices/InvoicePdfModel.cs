namespace Vexta.Api.Features.Invoices;

/// <summary>
/// Everything the invoice PDF prints, already resolved. The document class does no lookups and
/// makes no decisions about what is taxable or what an address is called: by the time a model
/// exists, those questions are answered. That is what keeps the layout readable and what lets
/// the saved invoice and the unsaved draft print through exactly the same code.
/// </summary>
public record InvoicePdfModel
{
    public required string Number { get; init; }
    public required DateOnly IssueDate { get; init; }
    public required DateOnly DueDate { get; init; }
    public string? ProjectLabel { get; init; }
    public string? PoNumber { get; init; }
    public required string Currency { get; init; }
    public string? Notes { get; init; }

    /// <summary>The company sending it: name, address, contact, registration numbers.</summary>
    public required string CompanyName { get; init; }
    public IReadOnlyList<string> CompanyLines { get; init; } = [];

    /// <summary>The logo bytes, or null when none is on file — the name stands in for it.</summary>
    public byte[]? Logo { get; init; }

    public required InvoicePdfParty BillTo { get; init; }

    /// <summary>Where the work happens. Empty when it is the billing address.</summary>
    public IReadOnlyList<string> SiteAddress { get; init; } = [];

    public IReadOnlyList<InvoicePdfLine> Lines { get; init; } = [];
    public decimal Subtotal { get; init; }

    /// <summary>
    /// TPS and TVQ as separate lines when the company's own rates account for the tax on every
    /// line, and a single "Taxes" line when they do not. Printing a 5 % TPS off an invoice whose
    /// lines were charged something else would be inventing a figure the tax people can check.
    /// </summary>
    public IReadOnlyList<InvoicePdfAmount> Taxes { get; init; } = [];

    public decimal Total { get; init; }
    public string? Terms { get; init; }
    public string? FooterNote { get; init; }
}

public record InvoicePdfParty(string Name, IReadOnlyList<string> Lines, string? Email);

public record InvoicePdfLine(string Description, decimal Quantity, decimal UnitPrice, decimal Amount);

public record InvoicePdfAmount(string Label, decimal Amount);
