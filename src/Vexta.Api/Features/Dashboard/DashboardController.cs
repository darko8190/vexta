using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;

namespace Vexta.Api.Features.Dashboard;

/// <summary>
/// The figures the company's own screen opens on.
///
/// Answered here rather than by the page calling six list endpoints and adding up the first
/// page of each. A list endpoint pages — asking /factures for the month's billing would give
/// the total of the twenty-five most recent invoices and call it a month — and six requests
/// arrive in six waves, which is a page that moves while somebody is reading it.
///
/// Staff, not owner. An employee who can see the projects and the invoices can already add
/// these numbers up by hand; what is owner-only is the payroll behind them, and none of it is
/// here. The leave requests and the expiring cards are counts, not names.
/// </summary>
[ApiController]
[Route("api/tableau-de-bord")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class DashboardController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>How far ahead a card about to expire is worth warning about.</summary>
    private const int CredentialWarningDays = 30;

    [HttpGet]
    public async Task<ActionResult<DashboardDto>> Get(CancellationToken ct)
    {
        if (currentUser.TenantId is null) return Forbid();

        var today = BusinessDay.Today;
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var lastMonthStart = monthStart.AddMonths(-1);
        var weekStart = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var weekEnd = weekStart.AddDays(6);

        var (gst, qst) = await RatesAsync(ct);

        // Every invoice that is not a draft and not cancelled, with its lines, because the total
        // is not stored — it is the lines run through the same arithmetic the printed invoice
        // uses. Loaded once and used for all four money figures rather than queried four times.
        var invoices = await db.Invoices.AsNoTracking()
            .Where(i => i.Status != InvoiceStatus.Brouillon && i.Status != InvoiceStatus.Annulee)
            .Include(i => i.Lines)
            .Select(i => new
            {
                i.Id,
                i.Number,
                ClientName = i.Client!.Name,
                i.IssueDate,
                i.DueDate,
                i.Status,
                i.IsTaxExempt,
                Lines = i.Lines.Select(l => new { l.Quantity, l.UnitPrice, l.IsTaxable }).ToList()
            })
            .ToListAsync(ct);

        // The payments in one pass, keyed by invoice. A subquery per invoice would be one round
        // trip per row of a company's whole billing history.
        var paid = await db.InvoicePayments.AsNoTracking()
            .GroupBy(p => p.InvoiceId)
            .Select(g => new { InvoiceId = g.Key, Amount = g.Sum(p => p.Amount) })
            .ToDictionaryAsync(x => x.InvoiceId, x => x.Amount, ct);

        // What went back out again. Without it an invoice the company refunded last week still
        // counts as money in hand on the one screen somebody reads every morning.
        var refunded = await InvoiceSettlement.RefundedByInvoiceAsync(
            db.InvoiceRefunds.AsNoTracking(), invoices.Select(i => i.Id).ToList(), ct);

        var rows = invoices.Select(i =>
        {
            var totals = InvoiceTotals.For(
                i.Lines.Select(l => new InvoiceTotals.Line(l.Quantity, l.UnitPrice, l.IsTaxable)),
                gst, qst, i.IsTaxExempt);

            var settled = InvoiceSettlement.Net(
                paid.GetValueOrDefault(i.Id, 0m), refunded.GetValueOrDefault(i.Id, 0m));

            return new
            {
                i.Id,
                i.Number,
                i.ClientName,
                i.IssueDate,
                i.DueDate,
                i.Status,
                Total = totals.Total,
                Paid = settled,
                Balance = totals.Total - settled
            };
        }).ToList();

        var outstanding = rows.Where(r => r.Balance > 0).ToList();
        var overdue = outstanding.Where(r => r.DueDate < today).ToList();

        // Cost, not selling price: this figure is what the company spent, and the selling price
        // is what it hopes to get back. An expense whose cost is still blank counts as nothing
        // rather than as its eventual price.
        var expenses = await db.ProjectExpenses.AsNoTracking()
            .Where(e => e.SpentOn != null && e.SpentOn >= monthStart)
            .SumAsync(e => e.Cost, ct) ?? 0m;

        var extras = await db.ProjectExtraCharges.AsNoTracking()
            .Where(c => c.ChargedOn != null && c.ChargedOn >= monthStart)
            .SumAsync(c => c.Cost, ct) ?? 0m;

        var hours = await db.TimesheetEntries.AsNoTracking()
            .Where(t => t.StartDate >= weekStart && t.StartDate <= weekEnd)
            .SumAsync(t => (decimal?)t.Hours, ct) ?? 0m;

        var recent = rows
            .OrderByDescending(r => r.IssueDate).ThenByDescending(r => r.Number)
            .Take(5)
            .Select(r => new DashboardInvoiceDto(
                r.Id, r.Number, r.ClientName, r.IssueDate, r.DueDate, r.Total, r.Paid,
                r.Status.ToString()))
            .ToList();

        // Tasks with no due date are left out: a list called "à venir" cannot order rows that
        // never come due, and they would sit at one end of it for ever.
        var tasks = await db.ProjectTasks.AsNoTracking()
            .Where(t => t.Status != ProjectTaskStatus.Terminee && t.DueDate != null)
            .OrderBy(t => t.DueDate)
            .Take(6)
            .Select(t => new DashboardTaskDto(
                t.Id,
                t.ProjectId,
                t.Project!.Number,
                t.Title,
                t.DueDate,
                t.DueDate < today))
            .ToListAsync(ct);

        var attention = new DashboardAttentionDto(
            overdue.Count,
            await db.ProjectTasks.CountAsync(
                t => t.Status != ProjectTaskStatus.Terminee && t.DueDate != null && t.DueDate < today, ct),
            await db.LeaveRequests.CountAsync(l => l.Status == LeaveStatus.EnAttente, ct),
            await db.EmployeeCredentials.CountAsync(
                c => c.ExpiresOn != null && c.ExpiresOn <= today.AddDays(CredentialWarningDays), ct),
            // Only products the company set a floor for. Everything else has no "low" to be at,
            // and counting a zero-stock consumable nobody tracks would make the line noise.
            await db.Products.CountAsync(
                p => p.MinimumQuantity != null && p.QuantityOnHand <= p.MinimumQuantity, ct),
            await db.Candidates.CountAsync(c => c.Status == CandidateStatus.Nouveau, ct));

        return Ok(new DashboardDto(
            rows.Where(r => r.IssueDate >= monthStart).Sum(r => r.Total),
            rows.Where(r => r.IssueDate >= lastMonthStart && r.IssueDate < monthStart).Sum(r => r.Total),
            outstanding.Sum(r => r.Balance),
            overdue.Sum(r => r.Balance),
            overdue.Count,
            expenses + extras,
            await db.Projects.CountAsync(
                p => p.Status == ProjectStatus.AFaire || p.Status == ProjectStatus.Commence, ct),
            await db.Projects.CountAsync(p => p.Status == ProjectStatus.AFacturer, ct),
            hours,
            attention,
            recent,
            tasks));
    }

    private async Task<(decimal Gst, decimal Qst)> RatesAsync(CancellationToken ct)
    {
        var settings = await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == currentUser.TenantId)
            .Select(b => new { b.GstRate, b.QstRate })
            .FirstOrDefaultAsync(ct);

        return (settings?.GstRate ?? 0m, settings?.QstRate ?? 0m);
    }
}
