using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;

namespace Vexta.Api.Features.Purchasing;

/// <summary>
/// One expense, as the company-wide list shows it: what it was, which job it was on, and the
/// two figures.
/// </summary>
public record ExpenseListItemDto(
    Guid Id,
    Guid ProjectId,
    int ProjectNumber,
    string ClientName,
    string Name,
    string? Description,
    Guid ExpenseTypeId,
    string ExpenseTypeName,
    decimal? Cost,
    decimal? SellingPrice,
    DateOnly? SpentOn,
    int PhotoCount,
    DateTimeOffset CreatedAt);

/// <summary>
/// The page's totals, over everything the filters match and not only the page being shown.
///
/// A total that counted twenty rows out of four hundred would be worse than no total: it looks
/// like an answer. The margin is the difference, left for the screen to format — a percentage
/// of a cost that is zero is not a number anybody should be handed.
/// </summary>
public record ExpenseTotalsDto(int Count, decimal Cost, decimal SellingPrice);

public record ExpenseListDto(PagedResult<ExpenseListItemDto> Page, ExpenseTotalsDto Totals);

/// <summary>
/// Every expense the company has filed, across all its jobs.
///
/// The same rows the project's own tab shows, asked the other way round: "combien on a dépensé
/// ce mois-ci" is a purchasing question, and answering it by opening forty projects is how
/// nobody ever answers it. Writing stays where the expense belongs — on the project — because
/// an expense with no job is a cost nobody can charge on.
/// </summary>
[ApiController]
[Route("api/depenses")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ExpensesController(VextaDbContext db) : ControllerBase
{
    /// <param name="type">One of the company's expense categories.</param>
    /// <param name="du">On or after this day. Read against the day the money went out.</param>
    /// <param name="au">On or before this day.</param>
    /// <param name="projet">One job, when the question is about one job.</param>
    [HttpGet]
    public async Task<ActionResult<ExpenseListDto>> List(
        [FromQuery] PagingQuery query,
        [FromQuery] Guid? type,
        [FromQuery] DateOnly? du,
        [FromQuery] DateOnly? au,
        [FromQuery] Guid? projet,
        CancellationToken ct)
    {
        var expenses = db.ProjectExpenses.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // ILike, not Contains: Contains becomes a case-sensitive LIKE on Postgres, and
            // nobody searches in the case the receipt was typed in.
            var pattern = $"%{query.Search.Trim()}%";
            expenses = expenses.Where(x =>
                EF.Functions.ILike(x.Name, pattern)
                || (x.Description != null && EF.Functions.ILike(x.Description, pattern))
                || EF.Functions.ILike(x.Project!.Client!.Name, pattern));
        }

        if (type is { } typeId) expenses = expenses.Where(x => x.ExpenseTypeId == typeId);
        if (projet is { } projectId) expenses = expenses.Where(x => x.ProjectId == projectId);

        // An expense with no date is left out of a dated search rather than swept in: it has
        // not been said when the money went out, so no range can honestly claim it.
        if (du is { } from) expenses = expenses.Where(x => x.SpentOn != null && x.SpentOn >= from);
        if (au is { } to) expenses = expenses.Where(x => x.SpentOn != null && x.SpentOn <= to);

        var totalCount = await expenses.CountAsync(ct);

        // Over the filtered set, in one round trip. Sum of a nullable column is null on an empty
        // set, which is why both land on zero explicitly.
        var sums = await expenses
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Cost = g.Sum(x => x.Cost) ?? 0m,
                Selling = g.Sum(x => x.SellingPrice) ?? 0m
            })
            .FirstOrDefaultAsync(ct);

        var items = await expenses
            .OrderByDescending(x => x.SpentOn)
            .ThenByDescending(x => x.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(x => new ExpenseListItemDto(
                x.Id,
                x.ProjectId,
                x.Project!.Number,
                x.Project!.Client!.Name,
                x.Name,
                x.Description,
                x.ExpenseTypeId,
                x.ExpenseType!.Name,
                x.Cost,
                x.SellingPrice,
                x.SpentOn,
                x.Photos.Count,
                x.CreatedAt))
            .ToListAsync(ct);

        return Ok(new ExpenseListDto(
            new PagedResult<ExpenseListItemDto>
            {
                Items = items,
                Page = query.Page,
                PageSize = query.PageSize,
                TotalCount = totalCount
            },
            new ExpenseTotalsDto(totalCount, sums?.Cost ?? 0m, sums?.Selling ?? 0m)));
    }
}
