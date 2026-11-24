using Vexta.Api.Domain;

namespace Vexta.Api.Features.Orders;

// ---- What the shop window offers, and what somebody sends it ----

/// <summary>
/// Whether this account may order from this company, and what it already knows about them.
///
/// Read before the basket offers a Commander button, so somebody is told what is missing instead
/// of being refused after filling in a delivery note.
/// </summary>
/// <param name="CanOrder">
/// False when the company does not take orders, or has taken its page down. The basket then says
/// so rather than offering a button that will fail.
/// </param>
/// <param name="Refusal">
/// Why not, when <paramref name="CanOrder"/> is false — a customer the company has blocked is
/// told plainly rather than left to guess. Null when the answer is yes.
/// </param>
/// <param name="ContactName">
/// What the company will see as the customer's name. From their client file when it has one,
/// from their account otherwise, and the checkout shows it so nobody orders under a name they
/// did not expect.
/// </param>
public record OrderEligibilityDto(
    string CompanyName,
    bool CanOrder,
    string? Refusal,
    string ContactName,
    string? ContactEmail,
    string? ContactPhone,
    /// <summary>
    /// Whether ordering here means paying for it now. The basket needs it before it offers the
    /// button: "Commander" and "Payer et commander" are two different promises, and somebody
    /// about to be sent to a card form should be told so beforehand.
    /// </summary>
    bool RequiresPayment);

/// <param name="Quantity">
/// How many. The price is never sent: it is read from the catalogue here, because a caller that
/// could name a price could name its own.
/// </param>
public record PlaceOrderLine(Guid ProductId, decimal Quantity);

public record PlaceOrderRequest(
    string Slug,
    List<PlaceOrderLine>? Lines,
    string? Note,
    /// <summary>Overrides the telephone number on file for this order only. Null keeps it.</summary>
    string? ContactPhone = null);

/// <summary>What to say back once an order is down: its number, so it can be quoted.</summary>
/// <param name="PaymentUrl">
/// Where to send the customer to pay, for a company that asks to be paid at its counter. Null
/// when the order stands on its own and the company will invoice it.
/// </param>
public record PlaceOrderResultDto(Guid Id, string Number, string Message, string? PaymentUrl);

/// <summary>The session the customer came back from, which Stripe is asked about rather than believed.</summary>
public record ConfirmOrderPaymentRequest(string? SessionId);

// ---- An order, read ----

public record OrderLineDto(
    Guid Id,
    Guid? ProductId,
    string Description,
    string? Unit,
    decimal Quantity,
    decimal UnitPrice,
    bool IsTaxable,
    decimal LineTotal,
    int SortOrder);

/// <summary>
/// An order as a list shows it. The figures are computed from the lines rather than stored, for
/// the same reason an invoice's are: one piece of arithmetic, used everywhere.
/// </summary>
public record OrderDto(
    Guid Id,
    string Number,
    Guid ClientId,
    string ClientName,
    string ContactName,
    string? ContactEmail,
    string? ContactPhone,
    CustomerOrderStatus Status,
    string Currency,
    decimal Subtotal,
    decimal TaxTotal,
    decimal Total,
    int LineCount,
    /// <summary>The invoice drawn from it, when there is one. The order is then done with.</summary>
    Guid? InvoiceId,
    string? InvoiceNumber,
    /// <summary>
    /// When the customer paid by card at the company's own counter, or null for an order the
    /// company will invoice the usual way. An order that arrives already paid is a different
    /// thing to pick, and the person at the counter has to be able to see which it is.
    /// </summary>
    DateTimeOffset? PaidAt,
    decimal AmountPaid,
    DateTimeOffset CreatedAt);

public record OrderDetailDto(OrderDto Order, string? Note, IReadOnlyList<OrderLineDto> Lines);

public record ChangeOrderStatusRequest(CustomerOrderStatus Status);

// ---- An order, from the customer's own space ----

/// <summary>
/// One order this person placed, read from their space rather than from inside the company's.
/// </summary>
/// <param name="CompanySlug">
/// Null when the company's page is not published. The row then names the seller without offering
/// a link to a page that is not there.
/// </param>
public record MyOrderDto(
    Guid Id,
    string Number,
    string CompanyName,
    string? CompanySlug,
    CustomerOrderStatus Status,
    string Currency,
    decimal Total,
    int LineCount,
    /// <summary>What was ordered, in one line: "Bardeaux BP Mystique × 12, et 2 autres".</summary>
    string Summary,
    /// <summary>When it was paid by card, or null — including for an order still at the till.</summary>
    DateTimeOffset? PaidAt,
    DateTimeOffset CreatedAt);
