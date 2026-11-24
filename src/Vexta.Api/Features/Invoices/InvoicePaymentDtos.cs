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
    /// <summary>What stayed with the company: taken in, less given back.</summary>
    decimal Paid,
    /// <summary>
    /// What was given back. Shown beside the paid figure rather than folded into it, because a
    /// hundred dollars that came in and went out again is not the same story as a hundred that
    /// never arrived, and the person reconciling the month has to be able to tell them apart.
    /// </summary>
    decimal Refunded,
    /// <summary>
    /// What credit notes took off the invoice. Not money: what the client stopped owing. It
    /// comes off the outstanding figure and never off what was paid.
    /// </summary>
    decimal Credited,
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

public record InvoiceRefundDto(
    Guid Id,
    Guid? InvoicePaymentId,
    DateOnly Date,
    decimal Amount,
    PaymentMethod Method,
    string? Reference,
    string? Note,
    /// <summary>
    /// Set when Stripe really sent the money back. Such a refund cannot be removed here:
    /// deleting the row would not bring the money back, and a book that disagrees with the bank
    /// is worse than one that records something awkward.
    /// </summary>
    string? StripeRefundId,
    DateTimeOffset CreatedAt);

/// <summary>
/// What was given back on one invoice, and what could still be.
/// </summary>
public record InvoiceRefundsDto(
    /// <summary>The most that can be given back: what stayed with the company.</summary>
    decimal Refundable,
    decimal Refunded,
    /// <summary>
    /// The payments that can still be reversed, with how much of each is left. Sent with the
    /// list so the form can offer the card payment that Stripe can actually reverse instead of
    /// asking somebody to recognise a payment intent by its reference.
    /// </summary>
    IReadOnlyList<RefundablePaymentDto> Payments,
    IReadOnlyList<InvoiceRefundDto> Refunds);

/// <param name="Online">
/// Whether this one can be sent back through the card it arrived on. False for everything
/// entered by hand, which is given back some other way and only written down here.
/// </param>
public record RefundablePaymentDto(
    Guid Id,
    DateOnly Date,
    decimal Amount,
    decimal Remaining,
    PaymentMethod Method,
    string? Reference,
    bool Online);

public record SaveInvoiceRefundRequest(
    decimal Amount,
    PaymentMethod Method,
    Guid? InvoicePaymentId = null,
    DateOnly? Date = null,
    string? Reference = null,
    string? Note = null,
    /// <summary>
    /// Whether to send it back through Stripe rather than only write it down. Refused unless
    /// the payment named above really came in through the card.
    /// </summary>
    bool Online = false);
