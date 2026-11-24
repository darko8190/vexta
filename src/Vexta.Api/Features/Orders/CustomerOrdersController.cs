using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.BillingSettings;
using Vexta.Api.Features.Invoices;

namespace Vexta.Api.Features.Orders;

/// <summary>
/// The orders a company has received through its public page.
///
/// Read by everyone who works there, because whoever is at the counter is the person who picks
/// the order. Moving one along is also theirs — "c'est prêt" is a counter decision, not a
/// management one. Turning an order into an invoice is not: that is the company deciding what
/// to charge, and it lands in the invoice book.
///
/// Nothing here edits an order's lines. An order is what the customer asked for, and a company
/// that could rewrite it would be able to change what somebody agreed to after the fact. What
/// the company charges goes on the invoice, which it owns and may change freely.
/// </summary>
[ApiController]
[Route("api/commandes-en-ligne")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class CustomerOrdersController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <param name="etat">One status, or nothing for all of them.</param>
    /// <param name="recherche">
    /// Matched against the number, the customer's name and what they wrote. Accent-insensitive,
    /// like every other search here: somebody typing "belanger" means Bélanger.
    /// </param>
    [HttpGet]
    public async Task<ActionResult<List<OrderDto>>> List(
        [FromQuery] CustomerOrderStatus? etat,
        [FromQuery] string? recherche,
        CancellationToken ct)
    {
        var query = db.CustomerOrders.AsNoTracking();
        if (etat is { } status) query = query.Where(o => o.Status == status);

        var rows = await query
            .OrderByDescending(o => o.CreatedAt)
            .Select(Projection())
            .ToListAsync(ct);

        var items = rows.Select(ToDto).ToList();

        if (!string.IsNullOrWhiteSpace(recherche))
        {
            // In memory, like the directory's: the accent-insensitive comparison is a .NET one
            // and no provider translates it, and a company's order book is a screenful.
            var needle = CompanyIdentity.Normalize(recherche);

            items = items
                .Where(o => CompanyIdentity.Normalize(o.Number).Contains(needle)
                    || CompanyIdentity.Normalize(o.ClientName).Contains(needle)
                    || CompanyIdentity.Normalize(o.ContactName).Contains(needle))
                .ToList();
        }

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var row = await db.CustomerOrders.AsNoTracking()
            .Where(o => o.Id == id)
            .Select(Projection())
            .FirstOrDefaultAsync(ct);

        if (row is null) return NotFound();

        var lines = await db.CustomerOrderLines.AsNoTracking()
            .Where(l => l.OrderId == id)
            .OrderBy(l => l.SortOrder)
            .Select(l => new OrderLineDto(
                l.Id,
                l.ProductId,
                l.Description,
                l.Unit,
                l.Quantity,
                l.UnitPrice,
                l.IsTaxable,
                0m,
                l.SortOrder))
            .ToListAsync(ct);

        // The line total is arithmetic, done here rather than in SQL so it rounds the way every
        // other money column in the application rounds.
        var priced = lines
            .Select(l => l with { LineTotal = InvoiceTotals.Round(l.Quantity * l.UnitPrice) })
            .ToList();

        return Ok(new OrderDetailDto(ToDto(row), row.Note, priced));
    }

    /// <summary>
    /// Where the order stands. The customer reads this in their own space, which is the whole
    /// reason it is worth keeping up to date.
    /// </summary>
    [HttpPut("{id:guid}/etat")]
    public async Task<ActionResult<OrderDetailDto>> ChangeStatus(
        Guid id, ChangeOrderStatusRequest request, CancellationToken ct)
    {
        if (!Enum.IsDefined(request.Status)) return BadRequest(new { message = "État inconnu." });

        var order = await db.CustomerOrders.FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();

        // Refused rather than silently allowed. An invoice has gone out against this order;
        // calling it cancelled afterwards would leave a bill nobody can explain. Cancelling the
        // invoice is the way back, and it is said here so nobody has to guess.
        if (request.Status == CustomerOrderStatus.Annulee && order.InvoiceId is not null)
        {
            return BadRequest(new
            {
                message = "Cette commande est déjà facturée. Annulez la facture avant d'annuler la commande."
            });
        }

        order.Status = request.Status;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return await Get(id, ct);
    }

    /// <summary>
    /// The invoice drawn from an order: the same lines, in the same order, at the same prices.
    ///
    /// A draft, always. The company decides what to charge — a delivery line, a discount, a
    /// correction — and an invoice that went out the moment somebody pressed a button on an
    /// order would be a document nobody read before it was sent.
    ///
    /// Done once. An order that has already produced an invoice points at it, and pressing again
    /// opens that one rather than billing somebody twice.
    /// </summary>
    [HttpPost("{id:guid}/facture")]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<OrderDetailDto>> Invoice(Guid id, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var order = await db.CustomerOrders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == id, ct);

        if (order is null) return NotFound();

        if (order.InvoiceId is not null)
        {
            return BadRequest(new { message = "Cette commande a déjà une facture." });
        }

        if (order.Status == CustomerOrderStatus.Annulee)
        {
            return BadRequest(new { message = "Cette commande est annulée." });
        }

        var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == order.ClientId, ct);
        if (client is null) return BadRequest(new { message = "Client introuvable." });

        // The same refusal a new invoice gets anywhere else: barring a client is a decision
        // about the future, and this document is the future.
        if (client.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });

        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
        if (settings is null)
        {
            return BadRequest(new
            {
                message = "Remplissez les paramètres de facturation avant de facturer une commande."
            });
        }

        var today = BusinessDay.Today;

        var invoice = new Domain.Invoice
        {
            TenantId = tenantId,
            Number = InvoiceNumbering.Format(settings.InvoicePrefix, settings.NextInvoiceNumber),
            ClientId = order.ClientId,
            Status = InvoiceStatus.Brouillon,
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

        db.Invoices.Add(invoice);

        order.InvoiceId = invoice.Id;
        // The order is done with once it is billed, unless the company already said more than
        // that. Moving it back from Livrée would be undoing something somebody observed.
        if (order.Status is CustomerOrderStatus.Recue or CustomerOrderStatus.EnPreparation)
        {
            order.Status = CustomerOrderStatus.Prete;
        }

        order.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return await Get(id, ct);
    }

    /// <summary>
    /// The row as it is read, before the arithmetic. A record rather than an anonymous type
    /// because both the list and the detail project it and then share <see cref="ToDto"/>.
    /// </summary>
    private record Row(
        Guid Id,
        int Number,
        Guid ClientId,
        string ClientName,
        string ContactName,
        string? ContactEmail,
        string? ContactPhone,
        string? Note,
        CustomerOrderStatus Status,
        string Currency,
        bool IsTaxExempt,
        decimal GstRate,
        decimal QstRate,
        Guid? InvoiceId,
        string? InvoiceNumber,
        DateTimeOffset CreatedAt,
        List<LineAmount> Lines);

    private record LineAmount(decimal Quantity, decimal UnitPrice, bool IsTaxable);

    private static System.Linq.Expressions.Expression<Func<CustomerOrder, Row>> Projection() =>
        o => new Row(
            o.Id,
            o.Number,
            o.ClientId,
            o.Client!.Name,
            o.ContactName,
            o.ContactEmail,
            o.ContactPhone,
            o.Note,
            o.Status,
            o.Currency,
            o.IsTaxExempt,
            o.GstRate,
            o.QstRate,
            o.InvoiceId,
            o.Invoice == null ? null : o.Invoice.Number,
            o.CreatedAt,
            o.Lines.Select(l => new LineAmount(l.Quantity, l.UnitPrice, l.IsTaxable)).ToList());

    /// <summary>
    /// The figures, worked out with the invoice arithmetic and the rates stored on the order.
    ///
    /// The company's current rates are deliberately not used: the customer was shown a total and
    /// accepted it, and a rate change next quarter must not quietly restate what they agreed to.
    /// </summary>
    private static OrderDto ToDto(Row row)
    {
        var totals = InvoiceTotals.For(
            row.Lines.Select(l => new InvoiceTotals.Line(l.Quantity, l.UnitPrice, l.IsTaxable)),
            row.GstRate,
            row.QstRate,
            row.IsTaxExempt);

        return new OrderDto(
            row.Id,
            OrderNumber.Of(row.Number),
            row.ClientId,
            row.ClientName,
            row.ContactName,
            row.ContactEmail,
            row.ContactPhone,
            row.Status,
            row.Currency,
            totals.Subtotal,
            totals.TaxTotal,
            totals.Total,
            row.Lines.Count,
            row.InvoiceId,
            row.InvoiceNumber,
            row.CreatedAt);
    }
}
