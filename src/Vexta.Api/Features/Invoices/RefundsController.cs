using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

/// <summary>One refund, read across the whole company rather than from one invoice.</summary>
public record RefundListItemDto(
    Guid Id,
    Guid InvoiceId,
    string InvoiceNumber,
    Guid? ClientId,
    string ClientName,
    DateOnly Date,
    decimal Amount,
    PaymentMethod Method,
    string? Reference,
    string? Note,
    /// <summary>Set when Stripe sent it back through the card rather than somebody writing it down.</summary>
    string? StripeRefundId,
    DateTimeOffset CreatedAt);

/// <summary>
/// The totals over everything the filters match, not over the page being shown.
///
/// <paramref name="Online"/> is held apart because it is the part that left the bank on its own.
/// A month where everything was given back by cheque and a month where a card reversed itself
/// read the same in a single figure, and they are not the same month to reconcile.
/// </summary>
public record RefundTotalsDto(int Count, decimal GivenBack, decimal Online);

public record RefundListDto(PagedResult<RefundListItemDto> Page, RefundTotalsDto Totals);

/// <summary>
/// Everything the company has given back, in one list.
///
/// Its own screen beside the payments for the same reason that one is not a tab on the
/// invoices: an invoice's refunds answer "what happened on this job", and this answers
/// "qu'est-ce qu'on a rendu ce mois-ci" — which crosses every invoice and belongs to whoever
/// does the books.
/// </summary>
[ApiController]
[Route("api/remboursements")]
[StaffOnly]
[Authorize(Roles = Roles.Managers)]
[RequireActiveSubscription]
public class RefundsController(VextaDbContext db) : ControllerBase
{
    /// <param name="recherche">Matches the invoice number, the client, or the reference written on it.</param>
    /// <param name="du">Inclusive. Null for no lower bound.</param>
    /// <param name="au">Inclusive. Null for no upper bound.</param>
    [HttpGet]
    public async Task<ActionResult<RefundListDto>> List(
        [FromQuery] PagingQuery query,
        [FromQuery] string? recherche,
        [FromQuery] Guid? client,
        [FromQuery] PaymentMethod? mode,
        [FromQuery] DateOnly? du,
        [FromQuery] DateOnly? au,
        CancellationToken ct)
    {
        var refunds = db.InvoiceRefunds.AsNoTracking().AsQueryable();

        if (client is { } clientId) refunds = refunds.Where(r => r.Invoice!.ClientId == clientId);
        if (mode is { } method) refunds = refunds.Where(r => r.Method == method);
        if (du is { } from) refunds = refunds.Where(r => r.Date >= from);
        if (au is { } to) refunds = refunds.Where(r => r.Date <= to);

        if (!string.IsNullOrWhiteSpace(recherche))
        {
            var term = recherche.Trim().ToLower();
            refunds = refunds.Where(r =>
                r.Invoice!.Number.ToLower().Contains(term)
                || r.Invoice!.Client!.Name.ToLower().Contains(term)
                || (r.Reference != null && r.Reference.ToLower().Contains(term)));
        }

        var totalCount = await refunds.CountAsync(ct);

        // Over the whole filtered set, in one trip. GroupBy on a constant is how EF is asked
        // for two sums without two round trips.
        var sums = await refunds
            .GroupBy(_ => 1)
            .Select(g => new
            {
                GivenBack = g.Sum(r => (decimal?)r.Amount) ?? 0m,
                Online = g.Where(r => r.StripeRefundId != null).Sum(r => (decimal?)r.Amount) ?? 0m
            })
            .FirstOrDefaultAsync(ct);

        var items = await refunds
            .OrderByDescending(r => r.Date).ThenByDescending(r => r.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(r => new RefundListItemDto(
                r.Id,
                r.InvoiceId,
                r.Invoice!.Number,
                r.Invoice!.ClientId,
                r.Invoice!.Client!.Name,
                r.Date,
                r.Amount,
                r.Method,
                r.Reference,
                r.Note,
                r.StripeRefundId,
                r.CreatedAt))
            .ToListAsync(ct);

        return Ok(new RefundListDto(
            new PagedResult<RefundListItemDto>
            {
                Items = items,
                Page = query.Page,
                PageSize = query.PageSize,
                TotalCount = totalCount
            },
            new RefundTotalsDto(totalCount, sums?.GivenBack ?? 0m, sums?.Online ?? 0m)));
    }
}
