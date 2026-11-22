using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

public record InvoicePaymentDto(
    Guid Id,
    DateOnly Date,
    decimal Amount,
    PaymentMethod Method,
    string? Reference,
    string? Note,
    DateTimeOffset CreatedAt);

/// <summary>
/// What has been paid on one invoice, and what is left.
///
/// The three figures travel together on purpose: a list of payments without the total it is
/// measured against is a list nobody can read, and computing the remainder in the browser means
/// two places doing the same arithmetic.
/// </summary>
public record InvoicePaymentsDto(
    decimal Total,
    decimal Paid,
    decimal Outstanding,
    /// <summary>
    /// Why "porté au compte" cannot be used, or null when it can. Sent with the list so the
    /// form can grey the option out with the reason rather than offer it and refuse it.
    /// </summary>
    string? AccountRefusal,
    IReadOnlyList<InvoicePaymentDto> Payments);

public record SaveInvoicePaymentRequest(
    decimal Amount,
    PaymentMethod Method,
    DateOnly? Date = null,
    string? Reference = null,
    string? Note = null);
