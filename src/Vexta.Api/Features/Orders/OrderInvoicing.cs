using Vexta.Api.Common;
using Vexta.Api.Domain;
using Vexta.Api.Features.BillingSettings;
using Vexta.Api.Features.Invoices;

namespace Vexta.Api.Features.Orders;

/// <summary>
/// The invoice an order becomes, written once because an order can reach the invoice book two
/// ways now: a manager presses the button, or a customer pays for it at the counter of the
/// company's own shop window.
///
/// Two copies of this mapping would eventually disagree, and the disagreement would be two
/// invoices for the same basket that do not add up to the same figure -- found by a customer
/// comparing them, which is the worst possible way to find it.
/// </summary>
public static class OrderInvoicing
{
    /// <summary>
    /// Builds the invoice and advances the company's numbering. The caller adds it, points the
    /// order at it and saves; nothing here touches the database.
    /// </summary>
    public static Domain.Invoice Build(
        CustomerOrder order, Client client, Domain.BillingSettings settings, InvoiceStatus status)
    {
        var today = BusinessDay.Today;

        var invoice = new Domain.Invoice
        {
            TenantId = order.TenantId,
            Number = InvoiceNumbering.Format(settings.InvoicePrefix, settings.NextInvoiceNumber),
            ClientId = order.ClientId,
            Status = status,
            IssueDate = today,
            DueDate = today.AddDays(settings.PaymentTermsDays),
            Currency = order.Currency,
            // The exemption is read from the client now rather than copied from the order: an
            // invoice is a tax document and has to say what is true the day it is issued.
            IsTaxExempt = client.IsTaxExempt,
            Notes = $"Commande {OrderNumber.Of(order.Number)} du {order.CreatedAt.ToLocalTime():d MMMM yyyy}."
                + (string.IsNullOrWhiteSpace(order.Note) ? "" : $"\n\n{order.Note.Trim()}"),
            Lines = order.Lines
                .OrderBy(l => l.SortOrder)
                .Select((l, index) => new InvoiceLine
                {
                    // Matériaux: everything on a shop order came out of the catalogue, which is
                    // what that kind means here. Labour and extras are typed by hand afterwards.
                    Kind = InvoiceLineKind.Materiaux,
                    ProductId = l.ProductId,
                    Description = l.Description,
                    Quantity = l.Quantity,
                    UnitPrice = l.UnitPrice,
                    IsTaxable = !client.IsTaxExempt && l.IsTaxable,
                    SortOrder = index
                })
                .ToList()
        };

        // Advanced here, not derived from a count: deleting an invoice must never hand its
        // number to the next one.
        settings.NextInvoiceNumber++;

        return invoice;
    }
}
