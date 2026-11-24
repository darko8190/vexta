using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Features.Orders;

// Vexta's invoice, never Stripe's. This file does not talk to Stripe at all.
using Invoice = Vexta.Api.Domain.Invoice;

namespace Vexta.Api.Features.Personal;

/// <summary>
/// A job this person holds, as their own space lists it.
/// </summary>
/// <param name="AddedOn">
/// When the company put this person on its list — not a hire date. Vexta does not record one,
/// and the field is named for what it actually knows rather than for what would read better.
/// </param>
/// <param name="CompanySlug">
/// Null when the company has no public page. The card then names the employer without
/// offering a link to a page that does not exist.
/// </param>
public record MyJobDto(
    Guid EmployeeId,
    string CompanyName,
    string? CompanySlug,
    string? JobTitle,
    UserRole Role,
    DateOnly AddedOn);

/// <summary>
/// One invoice a company has sent this person, read from their own space rather than from
/// inside that company's.
/// </summary>
/// <param name="Outstanding">What is still owed. Zero once it is settled.</param>
/// <param name="PayToken">
/// The payment link, when the company gave the invoice one and still takes cards. Null
/// otherwise, and the row then simply has no button.
/// </param>
public record MyInvoiceDto(
    Guid Id,
    string Number,
    string CompanyName,
    string? CompanySlug,
    DateOnly IssueDate,
    DateOnly DueDate,
    string Currency,
    decimal Total,
    decimal Paid,
    decimal Outstanding,
    InvoiceStatus Status,
    string? PayToken);

/// <summary>
/// What a person has across every company on Vexta: the jobs they hold, and the invoices they
/// have been sent.
///
/// The second controller that is not about a company, and for the same reason as
/// <see cref="PersonalProfileController"/>: these things belong to the person. Somebody who is
/// a customer of three contractors had to enter three spaces to see three invoices, which is
/// three places to forget one.
///
/// Every query starts from <c>currentUser.UserId</c> and ignores the tenant filters, because
/// there is no one tenant here — that is the point. The scoping in this file is the only
/// scoping there is, so each query names it explicitly rather than relying on a filter that
/// cannot apply.
///
/// Reading only. A person looks at their invoices here; paying one goes through the payment
/// link, and arguing with one goes to the company.
/// </summary>
[ApiController]
[Route("api/mon-espace")]
[Authorize]
public class PersonalDeskController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>
    /// The companies this person works for.
    ///
    /// Read from the employee records that carry their account, not from their memberships: a
    /// membership says what they may open, an employee record says they are on the payroll.
    /// Somebody given a login to a company they do not work for is not employed by it.
    /// </summary>
    [HttpGet("emplois")]
    public async Task<ActionResult<List<MyJobDto>>> Jobs(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        var rows = await db.Employees.IgnoreQueryFilters().AsNoTracking()
            .Where(e => e.UserId == userId)
            .Join(
                db.Tenants.IgnoreQueryFilters().AsNoTracking(),
                e => e.TenantId,
                t => t.Id,
                (e, t) => new { Employee = e, Company = t })
            // A personal space is not an employer, even though the person owns an employee row
            // in it: it would list somebody as working for themselves.
            .Where(row => row.Company.Kind == TenantKind.Business)
            .Select(row => new
            {
                EmployeeId = row.Employee.Id,
                TenantId = row.Company.Id,
                row.Company.Name,
                row.Company.Slug,
                row.Employee.JobTitle,
                row.Employee.Role,
                row.Employee.CreatedAt
            })
            .ToListAsync(ct);

        var published = await PublishedSlugsAsync(rows.Select(r => r.TenantId), ct);

        var items = rows
            // Most recently added first. Vexta records no hire date and no "left in 2019", so
            // there is nothing truer to sort on — and saying so is better than inventing an
            // order that looks like seniority.
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new MyJobDto(
                r.EmployeeId,
                r.Name,
                published.Contains(r.TenantId) ? r.Slug : null,
                r.JobTitle,
                r.Role,
                DateOnly.FromDateTime(r.CreatedAt.LocalDateTime)))
            .ToList();

        return Ok(items);
    }

    /// <summary>
    /// Every invoice addressed to this person, across every company that has one for them.
    ///
    /// A draft is left out. It has not been given to anybody, its figures are still moving, and
    /// a customer reading one would be reading a document their supplier has not finished
    /// writing.
    /// </summary>
    [HttpGet("factures")]
    public async Task<ActionResult<List<MyInvoiceDto>>> Invoices(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        // Which customer file this person is, in which company. A membership with no ClientId is
        // somebody who works there, and their employer's whole invoice book is not theirs to
        // read from here.
        var clientIds = await db.TenantMemberships.IgnoreQueryFilters().AsNoTracking()
            .Where(m => m.UserId == userId && m.Role == UserRole.Client && m.ClientId != null)
            .Select(m => m.ClientId!.Value)
            .ToListAsync(ct);

        // A client record can also carry the account directly, which is how a particulier was
        // invited before memberships existed. Both are counted, and the set removes the overlap.
        var direct = await db.Clients.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.UserId == userId)
            .Select(c => c.Id)
            .ToListAsync(ct);

        var mine = clientIds.Concat(direct).ToHashSet();
        if (mine.Count == 0) return Ok(new List<MyInvoiceDto>());

        var rows = await db.Invoices.IgnoreQueryFilters().AsNoTracking()
            .Where(i => mine.Contains(i.ClientId) && i.Status != InvoiceStatus.Brouillon)
            .Select(i => new
            {
                i.Id,
                i.Number,
                i.TenantId,
                i.IssueDate,
                i.DueDate,
                i.Currency,
                i.Status,
                i.IsTaxExempt,
                i.PayToken,
                Lines = i.Lines.Select(l => new { l.Quantity, l.UnitPrice, l.IsTaxable }).ToList()
            })
            .ToListAsync(ct);

        if (rows.Count == 0) return Ok(new List<MyInvoiceDto>());

        var tenantIds = rows.Select(r => r.TenantId).Distinct().ToList();

        var companies = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => tenantIds.Contains(t.Id))
            .Select(t => new { t.Id, t.Name, t.Slug, t.StripeChargesEnabled, t.StripeAccountId })
            .ToDictionaryAsync(t => t.Id, t => t, ct);

        var published = await PublishedSlugsAsync(tenantIds, ct);

        // The two rates are the company's, so they are read per company rather than once: two
        // invoices from two provinces do not share a tax rate.
        var settings = await db.BillingSettings.IgnoreQueryFilters().AsNoTracking()
            .Where(b => tenantIds.Contains(b.TenantId))
            .ToDictionaryAsync(b => b.TenantId, b => b, ct);

        var invoiceIds = rows.Select(r => r.Id).ToList();

        var payments = await db.InvoicePayments.IgnoreQueryFilters().AsNoTracking()
            .Where(p => invoiceIds.Contains(p.InvoiceId))
            .GroupBy(p => p.InvoiceId)
            .Select(g => new { g.Key, Amount = g.Sum(x => x.Amount) })
            .ToDictionaryAsync(x => x.Key, x => x.Amount, ct);

        var items = rows
            .Select(r =>
            {
                var company = companies.GetValueOrDefault(r.TenantId);

                var total = InvoiceTotals.For(
                    r.Lines.Select(l => new InvoiceTotals.Line(l.Quantity, l.UnitPrice, l.IsTaxable)),
                    settings.GetValueOrDefault(r.TenantId)?.GstRate ?? 0m,
                    settings.GetValueOrDefault(r.TenantId)?.QstRate ?? 0m,
                    r.IsTaxExempt).Total;

                var paid = payments.GetValueOrDefault(r.Id);
                var outstanding = InvoiceTotals.Round(Math.Max(0m, total - paid));

                // The link is offered only when pressing it would work: the company has an
                // account that can take cards, and there is something left to pay.
                var canPay = company is not null
                    && company.StripeAccountId is not null
                    && company.StripeChargesEnabled
                    && outstanding > 0
                    && r.Status != InvoiceStatus.Annulee;

                return new MyInvoiceDto(
                    r.Id,
                    r.Number,
                    company?.Name ?? "",
                    company is not null && published.Contains(company.Id) ? company.Slug : null,
                    r.IssueDate,
                    r.DueDate,
                    r.Currency,
                    InvoiceTotals.Round(total),
                    InvoiceTotals.Round(paid),
                    outstanding,
                    r.Status,
                    canPay ? r.PayToken : null);
            })
            // What is owed first, newest within that: somebody opening this screen is answering
            // "what do I still have to pay", not browsing their filing.
            .OrderBy(x => x.Outstanding <= 0)
            .ThenByDescending(x => x.IssueDate)
            .ToList();

        return Ok(items);
    }

    /// <summary>
    /// Every order this person placed, across every company they have bought from.
    ///
    /// Keyed on the account that placed it rather than on a customer file, unlike the invoices
    /// above. The two differ on purpose: a company may invoice a client file somebody was given
    /// access to afterwards, but an order was placed by a person who was signed in at the time,
    /// and that person is the one who should see it.
    /// </summary>
    [HttpGet("commandes")]
    public async Task<ActionResult<List<MyOrderDto>>> Orders(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        var rows = await db.CustomerOrders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.PlacedByUserId == userId)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new
            {
                o.Id,
                o.Number,
                o.TenantId,
                o.Status,
                o.PaidAt,
                o.Currency,
                o.IsTaxExempt,
                o.GstRate,
                o.QstRate,
                o.CreatedAt,
                Lines = o.Lines
                    .OrderBy(l => l.SortOrder)
                    .Select(l => new { l.Description, l.Quantity, l.UnitPrice, l.IsTaxable })
                    .ToList()
            })
            .ToListAsync(ct);

        if (rows.Count == 0) return Ok(new List<MyOrderDto>());

        var tenantIds = rows.Select(r => r.TenantId).Distinct().ToList();

        var companies = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => tenantIds.Contains(t.Id))
            .Select(t => new { t.Id, t.Name, t.Slug })
            .ToDictionaryAsync(t => t.Id, t => t, ct);

        var published = await PublishedSlugsAsync(tenantIds, ct);

        var items = rows
            .Select(r =>
            {
                var company = companies.GetValueOrDefault(r.TenantId);

                // The rates stored on the order, not the company's current ones: the figure
                // shown here has to be the figure that was agreed to.
                var total = InvoiceTotals.For(
                    r.Lines.Select(l => new InvoiceTotals.Line(l.Quantity, l.UnitPrice, l.IsTaxable)),
                    r.GstRate,
                    r.QstRate,
                    r.IsTaxExempt).Total;

                var first = r.Lines.FirstOrDefault();

                var summary = first is null
                    ? "—"
                    : r.Lines.Count == 1
                        ? first.Description
                        : $"{first.Description}, et {r.Lines.Count - 1} autre{(r.Lines.Count > 2 ? "s" : "")}";

                return new MyOrderDto(
                    r.Id,
                    OrderNumber.Of(r.Number),
                    company?.Name ?? "",
                    company is not null && published.Contains(company.Id) ? company.Slug : null,
                    r.Status,
                    r.Currency,
                    InvoiceTotals.Round(total),
                    r.Lines.Count,
                    summary,
                    r.PaidAt,
                    r.CreatedAt);
            })
            .ToList();

        return Ok(items);
    }

    /// <summary>
    /// Of the companies given, the ones whose public page is published — the only ones whose
    /// slug leads anywhere.
    /// </summary>
    private async Task<HashSet<Guid>> PublishedSlugsAsync(IEnumerable<Guid> tenantIds, CancellationToken ct)
    {
        var ids = tenantIds.Distinct().ToList();
        if (ids.Count == 0) return [];

        var published = await db.PublicPages.IgnoreQueryFilters().AsNoTracking()
            .Where(p => ids.Contains(p.TenantId) && p.IsPublished)
            .Select(p => p.TenantId)
            .ToListAsync(ct);

        return published.ToHashSet();
    }
}
