using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

public record InvoiceLineDto(Guid Id, string Description, decimal Quantity, decimal UnitPrice, decimal TaxRatePercent, int SortOrder);

public record InvoiceDto(
    Guid Id,
    string Number,
    Guid ClientId,
    string ClientName,
    Guid? ProjectId,
    string? ProjectName,
    InvoiceStatus Status,
    DateOnly IssueDate,
    DateOnly DueDate,
    string Currency,
    string? Notes,
    decimal Subtotal,
    decimal TaxTotal,
    decimal Total,
    List<InvoiceLineDto> Lines,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record InvoiceLineRequest(string Description, decimal Quantity, decimal UnitPrice, decimal TaxRatePercent);

public record UpsertInvoiceRequest(
    Guid ClientId,
    Guid? ProjectId,
    InvoiceStatus Status,
    DateOnly IssueDate,
    DateOnly DueDate,
    string Currency,
    string? Notes,
    List<InvoiceLineRequest> Lines);
