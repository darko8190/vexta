using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;

namespace Vexta.Api.Features.Counts;

/// <summary>How many rows sit behind each sub-tab of the company's main screens.</summary>
public record SectionCountsDto(
    int Invoices,
    int Payments,
    int Credits,
    int Refunds,
    int Expenses,
    int Suppliers,
    int PurchaseOrders,
    int GoodsReceipts,
    int Timesheets);

/// <summary>
/// The badges on the rails of Facturation, Achats, Fournisseurs &amp; Commandes and Feuilles de
/// temps — the same badges a project's own rail carries, so the sub-tabs say what is behind them
/// before they are opened. One request for all of them: a rail that fills in one badge at a time
/// reads as broken. The query filters scope every count to the company.
/// </summary>
[ApiController]
[Route("api/compteurs")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
[RequireActiveSubscription]
public class SectionCountsController(VextaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<SectionCountsDto>> Get(CancellationToken ct) =>
        Ok(new SectionCountsDto(
            await db.Invoices.CountAsync(ct),
            await db.InvoicePayments.CountAsync(ct),
            await db.InvoiceCredits.CountAsync(ct),
            await db.InvoiceRefunds.CountAsync(ct),
            await db.ProjectExpenses.CountAsync(ct),
            await db.Suppliers.CountAsync(ct),
            await db.PurchaseOrders.CountAsync(ct),
            await db.GoodsReceipts.CountAsync(ct),
            await db.TimesheetEntries.CountAsync(ct)));
}
