using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

public record InvoiceLineDto(Guid Id, string Description, decimal Quantity, decimal UnitPrice, decimal TaxRatePercent, int SortOrder);

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
    /// <summary>No tax on this invoice. Every line's rate is zero while it is set.</summary>
    bool IsTaxExempt,
    decimal Subtotal,
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
public record InvoiceLineRequest(string? Description, decimal Quantity, decimal UnitPrice, decimal TaxRatePercent);

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
    List<InvoiceLineRequest> Lines);
