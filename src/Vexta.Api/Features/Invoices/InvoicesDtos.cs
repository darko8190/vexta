using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

public record InvoiceLineDto(
    Guid Id,
    InvoiceLineKind Kind,
    /// <summary>The catalogue entry this line came from, for a material or a piece of equipment.</summary>
    Guid? ProductId,
    string Description,
    decimal Quantity,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    /// <summary>The selling price per unit — what the client is charged.</summary>
    decimal UnitPrice,
    bool IsTaxable,
    int SortOrder);

public record InvoiceDto(
    Guid Id,
    string Number,
    Guid ClientId,
    string ClientName,
    Guid? ProjectId,
    /// <summary>The project's own number, so a reference reads P-0007 and never a GUID.</summary>
    int? ProjectNumber,
    InvoiceStatus Status,
    DateOnly IssueDate,
    DateOnly DueDate,
    string Currency,
    string? Notes,
    /// <summary>No tax on this invoice. No line is taxable while it is set.</summary>
    bool IsTaxExempt,
    /// <summary>Which margin the catalogue lines were priced with, if any.</summary>
    Guid? PricePolicyId,
    string? PricePolicyName,
    /// <summary>When it was emailed to the client, or null if it never was.</summary>
    DateTimeOffset? SentAt,
    decimal Subtotal,
    /// <summary>
    /// The two taxes, named and separated. One "taxes" figure is what a company gets asked to
    /// break down the moment it files a return, and splitting it after the fact means
    /// recomputing from rates that may have changed since.
    /// </summary>
    string Tax1Label,
    decimal Tax1,
    string Tax2Label,
    decimal Tax2,
    decimal TaxTotal,
    decimal Total,
    List<InvoiceLineDto> Lines,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <summary>
/// Description is nullable so that a line being typed can still be previewed. A non-nullable
/// string here is implicitly required by model binding, which answered the preview of a
/// half-filled invoice with a 400 — the one invoice the preview exists for. What may not be
/// saved blank is checked where it matters, when the invoice is created.
/// </summary>
public record InvoiceLineRequest(
    InvoiceLineKind Kind,
    Guid? ProductId,
    string? Description,
    decimal Quantity,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    decimal UnitPrice,
    bool IsTaxable);

public record UpsertInvoiceRequest(
    Guid ClientId,
    Guid? ProjectId,
    InvoiceStatus Status,
    DateOnly IssueDate,
    DateOnly DueDate,
    string Currency,
    string? Notes,
    /// <summary>
    /// Null means "take the answer from the project, or from the client when there is none",
    /// which is what a new invoice does.
    /// </summary>
    bool? IsTaxExempt,
    /// <summary>Null keeps whatever the invoice has, or takes the project's on a new one.</summary>
    Guid? PricePolicyId,
    List<InvoiceLineRequest> Lines);

/// <summary>What sending an invoice answers: where it went, and what it is now.</summary>
public record InvoiceSentDto(string Email, DateTimeOffset SentAt, InvoiceStatus Status);
