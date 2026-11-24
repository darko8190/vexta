using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;

namespace Vexta.Api.Features.Invoices;

/// <summary>One credit note, read across the whole company rather than from one invoice.</summary>
public record CreditListItemDto(
    Guid Id,
    string Number,
    Guid InvoiceId,
    string InvoiceNumber,
    Guid? ClientId,
    string ClientName,
    DateOnly Date,
    decimal Subtotal,
    decimal Gst,
    decimal Qst,
    decimal Amount,
    string Reason,
    DateTimeOffset CreatedAt);

/// <summary>
/// The totals over everything the filters match, not over the page being shown. The two taxes
/// are summed apart because they are what the returns need: the GST and the QST credited in a
/// period come off what was collected, each on its own form.
/// </summary>
public record CreditTotalsDto(int Count, decimal Amount, decimal Gst, decimal Qst);

public record CreditListDto(PagedResult<CreditListItemDto> Page, CreditTotalsDto Totals);

/// <summary>
/// Every credit note the company has issued, in one list. The same shape as the payments and
/// the refunds beside it, for the person doing the books: "qu'est-ce qu'on a crédité ce
/// trimestre" crosses every invoice.
/// </summary>
[ApiController]
[Route("api/credits")]
[StaffOnly]
[Authorize(Roles = Roles.Managers)]
[RequireActiveSubscription]
public class CreditsController(VextaDbContext db) : ControllerBase
{
    /// <param name="recherche">Matches the credit note's number, the invoice's, the client, or the reason.</param>
    /// <param name="du">Inclusive. Null for no lower bound.</param>
    /// <param name="au">Inclusive. Null for no upper bound.</param>
    [HttpGet]
    public async Task<ActionResult<CreditListDto>> List(
        [FromQuery] PagingQuery query,
        [FromQuery] string? recherche,
        [FromQuery] Guid? client,
        [FromQuery] DateOnly? du,
        [FromQuery] DateOnly? au,
        CancellationToken ct)
    {
        var credits = db.InvoiceCredits.AsNoTracking().AsQueryable();

        if (client is { } clientId) credits = credits.Where(c => c.Invoice!.ClientId == clientId);
        if (du is { } from) credits = credits.Where(c => c.Date >= from);
        if (au is { } to) credits = credits.Where(c => c.Date <= to);

        if (!string.IsNullOrWhiteSpace(recherche))
        {
            var term = recherche.Trim().ToLower();
            credits = credits.Where(c =>
                c.Number.ToLower().Contains(term)
                || c.Invoice!.Number.ToLower().Contains(term)
                || c.Invoice!.Client!.Name.ToLower().Contains(term)
                || c.Reason.ToLower().Contains(term));
        }

        var totalCount = await credits.CountAsync(ct);

        var sums = await credits
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Amount = g.Sum(c => (decimal?)c.Amount) ?? 0m,
                Gst = g.Sum(c => (decimal?)c.Gst) ?? 0m,
                Qst = g.Sum(c => (decimal?)c.Qst) ?? 0m
            })
            .FirstOrDefaultAsync(ct);

        var items = await credits
            .OrderByDescending(c => c.Date).ThenByDescending(c => c.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(c => new CreditListItemDto(
                c.Id,
                c.Number,
                c.InvoiceId,
                c.Invoice!.Number,
                c.Invoice!.ClientId,
                c.Invoice!.Client!.Name,
                c.Date,
                c.Subtotal,
                c.Gst,
                c.Qst,
                c.Amount,
                c.Reason,
                c.CreatedAt))
            .ToListAsync(ct);

        return Ok(new CreditListDto(
            new PagedResult<CreditListItemDto>
            {
                Items = items,
                Page = query.Page,
                PageSize = query.PageSize,
                TotalCount = totalCount
            },
            new CreditTotalsDto(totalCount, sums?.Amount ?? 0m, sums?.Gst ?? 0m, sums?.Qst ?? 0m)));
    }
}
