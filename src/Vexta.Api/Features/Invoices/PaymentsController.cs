using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

/// <summary>One payment, read across the whole company rather than from one invoice.</summary>
public record PaymentListItemDto(
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
    DateTimeOffset CreatedAt);

/// <summary>
/// The totals over everything the filters match, not over the page being shown.
///
/// <paramref name="OnAccount"/> is held apart from the rest because it is the one line that is
/// not money: it is the invoice being settled against the client's account, and adding it to a
/// day's takings would make the till look fuller than the bank.
/// </summary>
public record PaymentTotalsDto(int Count, decimal Received, decimal OnAccount);

public record PaymentListDto(PagedResult<PaymentListItemDto> Page, PaymentTotalsDto Totals);

/// <summary>
/// Every payment the company has taken, in one list.
///
/// Its own screen rather than a tab on the invoices, because the question is different: an
/// invoice's payments answer "is this one settled", and this list answers "qu'est-ce qui est
/// rentré cette semaine" — which crosses every invoice and belongs to whoever does the books.
/// </summary>
[ApiController]
[Route("api/paiements")]
[StaffOnly]
[Authorize(Roles = Roles.Managers)]
[RequireActiveSubscription]
public class PaymentsController(VextaDbContext db) : ControllerBase
{
    /// <param name="recherche">Matches the invoice number, the client, or the reference written on it.</param>
    /// <param name="client">Only this client's payments.</param>
    /// <param name="mode">Only payments taken this way.</param>
    /// <param name="du">On or after this day.</param>
    /// <param name="au">On or before this day.</param>
    [HttpGet]
    public async Task<ActionResult<PaymentListDto>> List(
        [FromQuery] PagingQuery query,
        [FromQuery] string? recherche,
        [FromQuery] Guid? client,
        [FromQuery] PaymentMethod? mode,
        [FromQuery] DateOnly? du,
        [FromQuery] DateOnly? au,
        CancellationToken ct)
    {
        var payments = db.InvoicePayments.AsNoTracking().AsQueryable();

        if (client is { } clientId) payments = payments.Where(p => p.Invoice!.ClientId == clientId);
        if (mode is { } method) payments = payments.Where(p => p.Method == method);
        if (du is { } from) payments = payments.Where(p => p.Date >= from);
        if (au is { } to) payments = payments.Where(p => p.Date <= to);

        if (!string.IsNullOrWhiteSpace(recherche))
        {
            var term = recherche.Trim().ToLower();
            payments = payments.Where(p =>
                p.Invoice!.Number.ToLower().Contains(term)
                || p.Invoice!.Client!.Name.ToLower().Contains(term)
                || (p.Reference != null && p.Reference.ToLower().Contains(term)));
        }

        var totalCount = await payments.CountAsync(ct);

        // Over the whole filtered set, in one trip. GroupBy on a constant is how EF is asked
        // for two sums without two round trips.
        var sums = await payments
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Received = g.Where(p => p.Method != PaymentMethod.PorteAuCompte).Sum(p => (decimal?)p.Amount) ?? 0m,
                OnAccount = g.Where(p => p.Method == PaymentMethod.PorteAuCompte).Sum(p => (decimal?)p.Amount) ?? 0m
            })
            .FirstOrDefaultAsync(ct);

        var items = await payments
            .OrderByDescending(p => p.Date).ThenByDescending(p => p.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(p => new PaymentListItemDto(
                p.Id,
                p.InvoiceId,
                p.Invoice!.Number,
                p.Invoice!.ClientId,
                p.Invoice!.Client!.Name,
                p.Date,
                p.Amount,
                p.Method,
                p.Reference,
                p.Note,
                p.CreatedAt))
            .ToListAsync(ct);

        return Ok(new PaymentListDto(
            new PagedResult<PaymentListItemDto>
            {
                Items = items,
                Page = query.Page,
                PageSize = query.PageSize,
                TotalCount = totalCount
            },
            new PaymentTotalsDto(totalCount, sums?.Received ?? 0m, sums?.OnAccount ?? 0m)));
    }
}
