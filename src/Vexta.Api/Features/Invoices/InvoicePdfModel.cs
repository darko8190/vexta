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
    /// <summary>The invoice's due date, or how long a quote holds. A quote may have none.</summary>
    public DateOnly? DueDate { get; init; }
    public string? ProjectLabel { get; init; }
    public string? PoNumber { get; init; }
    public required string Currency { get; init; }
    public string? Notes { get; init; }

    /// <summary>The company sending it: name, address, contact, registration numbers.</summary>
    public required string CompanyName { get; init; }
    public IReadOnlyList<string> CompanyLines { get; init; } = [];

    /// <summary>The logo bytes, or null when none is on file — the name stands in for it.</summary>
    public byte[]? Logo { get; init; }

    /// <summary>
    /// The company's own colour as #RRGGBB, or null for Vexta's blue. The same colour the
    /// application paints its buttons with, so a client who signs in and a client who gets the
    /// PDF see one company rather than two.
    /// </summary>
    public string? BrandColor { get; init; }

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

    /// <summary>
    /// The signature given online, printed where a pen would sign. Null leaves the blank line
    /// for a signature on paper.
    /// </summary>
    public InvoicePdfSignature? Signature { get; init; }

    /// <summary>
    /// A quote's extras not taken (yet): listed apart, with their price, and outside the total.
    /// Empty on an invoice.
    /// </summary>
    public IReadOnlyList<InvoicePdfLine> Options { get; init; } = [];

    /// <summary>
    /// What the paper calls itself, and the few words that change with it. An invoice by
    /// default; a quote prints through the same layout with its own words, so the two documents
    /// a client gets from one company look like they came from one company.
    /// </summary>
    public InvoicePdfWording Wording { get; init; } = InvoicePdfWording.Invoice;
}

public record InvoicePdfWording(
    string Title,
    string Name,
    string DueLabel,
    string BillToLabel,
    string SignatureHeading,
    string SignatureText)
{
    public static readonly InvoicePdfWording Invoice = new(
        "FACTURE",
        "Facture",
        "Échéance",
        "Facturer à:",
        "Réception",
        "En signant, le client confirme avoir reçu la présente facture et les travaux ou biens qu'elle décrit.");

    public static readonly InvoicePdfWording Quote = new(
        "SOUMISSION",
        "Soumission",
        "Valide jusqu'au",
        "Préparée pour:",
        "Acceptation",
        "En signant, le client accepte la présente soumission et autorise les travaux qu'elle décrit, aux prix indiqués.");
}

/// <param name="Name">The name as the customer typed it to sign.</param>
/// <param name="Date">The day, as the paper prints dates.</param>
/// <param name="Statement">The sentence that says how and when it was signed.</param>
/// <param name="Drawn">The signature drawn on screen, as a PNG, when there is one.</param>
public record InvoicePdfSignature(string Name, string Date, string Statement, byte[]? Drawn = null);

public record InvoicePdfParty(string Name, IReadOnlyList<string> Lines, string? Email);

public record InvoicePdfLine(string Description, decimal Quantity, decimal UnitPrice, decimal Amount);

public record InvoicePdfAmount(string Label, decimal Amount);
