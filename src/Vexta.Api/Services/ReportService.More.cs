using Microsoft.EntityFrameworkCore;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Features.Reports;

namespace Vexta.Api.Services;

/// <summary>
/// The reports of sales, billing, inventory, purchases, production, timesheets and labour. Same
/// shape as the first ones: a title, columns, rows of formatted cells and a bottom line.
/// </summary>
public partial class ReportService
{
    private Task<ReportResultDto?> RunMoreAsync(string key, ReportPeriod period, CancellationToken ct) =>
        key switch
        {
            ReportKeys.SalesByMonth => SalesByMonthAsync(period, ct),
            ReportKeys.SalesByClient => SalesByClientAsync(period, ct),
            ReportKeys.SalesByProduct => SalesByProductAsync(period, ct),
            ReportKeys.UnpaidInvoices => UnpaidInvoicesAsync(ct),
            ReportKeys.PaymentsReceived => PaymentsReceivedAsync(period, ct),
            ReportKeys.ClientBalances => ClientBalancesAsync(ct),
            ReportKeys.InventoryValue => InventoryValueAsync(ct),
            ReportKeys.InventoryBelowMinimum => InventoryBelowMinimumAsync(ct),
            ReportKeys.ExpensesByType => ExpensesByTypeAsync(period, ct),
            ReportKeys.PurchasesBySupplier => PurchasesBySupplierAsync(period, ct),
            ReportKeys.ProjectProfitability => ProjectProfitabilityAsync(period, ct),
            ReportKeys.CompletedTasks => CompletedTasksAsync(period, ct),
            ReportKeys.HoursByProject => HoursByProjectAsync(period, ct),
            ReportKeys.LabourByEmployee => LabourByEmployeeAsync(period, ct),
            ReportKeys.LabourByProject => LabourByProjectAsync(period, ct),
            _ => Task.FromResult<ReportResultDto?>(null)
        };

    // ---- The invoices every money report starts from ----

    private record BilledInvoice(
        Guid Id, string Number, Guid ClientId, string ClientName, DateOnly IssueDate, DateOnly DueDate,
        decimal Subtotal, decimal Taxes, decimal Total, decimal Paid, decimal Credited, decimal Balance);

    /// <summary>
    /// The invoices that have left — no drafts, no cancelled ones — with their totals computed the
    /// way the invoice screens compute them, and what was paid, credited and refunded on them.
    /// </summary>
    private async Task<List<BilledInvoice>> BilledAsync(DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var settings = await db.BillingSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var query = db.Invoices.AsNoTracking()
            .Include(i => i.Lines)
            .Include(i => i.Client)
            .Where(i => i.Status != InvoiceStatus.Brouillon && i.Status != InvoiceStatus.Annulee);
        if (from is { } f) query = query.Where(i => i.IssueDate >= f);
        if (to is { } t) query = query.Where(i => i.IssueDate <= t);
        var invoices = await query.ToListAsync(ct);
        var ids = invoices.Select(i => i.Id).ToList();

        var paid = await db.InvoicePayments.AsNoTracking().Where(p => ids.Contains(p.InvoiceId))
            .GroupBy(p => p.InvoiceId).Select(g => new { g.Key, Sum = g.Sum(p => p.Amount) })
            .ToDictionaryAsync(x => x.Key, x => x.Sum, ct);
        var refunded = await db.InvoiceRefunds.AsNoTracking().Where(p => ids.Contains(p.InvoiceId))
            .GroupBy(p => p.InvoiceId).Select(g => new { g.Key, Sum = g.Sum(p => p.Amount) })
            .ToDictionaryAsync(x => x.Key, x => x.Sum, ct);
        var credited = await db.InvoiceCredits.AsNoTracking().Where(p => ids.Contains(p.InvoiceId))
            .GroupBy(p => p.InvoiceId).Select(g => new { g.Key, Sum = g.Sum(p => p.Amount) })
            .ToDictionaryAsync(x => x.Key, x => x.Sum, ct);

        return invoices.Select(i =>
        {
            var totals = InvoiceTotals.For(i.Lines, settings, i.IsTaxExempt);
            var net = paid.GetValueOrDefault(i.Id) - refunded.GetValueOrDefault(i.Id);
            var credit = credited.GetValueOrDefault(i.Id);
            return new BilledInvoice(i.Id, i.Number, i.ClientId, i.Client?.Name ?? "", i.IssueDate, i.DueDate,
                totals.Subtotal, totals.TaxTotal, totals.Total, net, credit, Math.Max(0m, totals.Total - net - credit));
        }).ToList();
    }

    private static ReportResultDto Result(
        string key, string? subtitle, IReadOnlyList<ReportColumnDto> columns,
        IEnumerable<IReadOnlyList<string>> rows, IReadOnlyList<string>? totals) =>
        new(Labels[key], subtitle, columns, rows.ToList(), totals, DateTimeOffset.UtcNow);

    private static ReportColumnDto Text(string label) => new(label);
    private static ReportColumnDto Num(string label) => new(label, Numeric: true);
    private static string Count(int value) => value.ToString(Culture);
    private static string Qty(decimal value) => value.ToString("0.##", Culture);
    private static string Percent(decimal profit, decimal revenue) =>
        revenue <= 0 ? "—" : (profit / revenue).ToString("P1", Culture);

    // ---- Ventes ----

    private async Task<ReportResultDto?> SalesByMonthAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var invoices = await BilledAsync(from, to, ct);
        var collected = await db.InvoicePayments.AsNoTracking()
            .Where(p => p.Date >= from && p.Date <= to)
            .Select(p => new { p.Date, p.Amount })
            .ToListAsync(ct);

        var months = new List<DateOnly>();
        for (var m = new DateOnly(from.Year, from.Month, 1); m <= to; m = m.AddMonths(1)) months.Add(m);

        var rows = months.Select(m =>
        {
            var inMonth = invoices.Where(i => i.IssueDate.Year == m.Year && i.IssueDate.Month == m.Month).ToList();
            var cash = collected.Where(p => p.Date.Year == m.Year && p.Date.Month == m.Month).Sum(p => p.Amount);
            return (Month: m, Count: inMonth.Count, Sub: inMonth.Sum(i => i.Subtotal), Tax: inMonth.Sum(i => i.Taxes),
                Total: inMonth.Sum(i => i.Total), Cash: cash);
        }).ToList();

        return Result(ReportKeys.SalesByMonth, PeriodLabel(from, to),
            [Text("Mois"), Num("Factures"), Num("Avant taxes"), Num("Taxes"), Num("Total"), Num("Encaissé")],
            rows.Select(r => (IReadOnlyList<string>)
            [
                r.Month.ToString("MMMM yyyy", Culture), Count(r.Count), Money(r.Sub), Money(r.Tax), Money(r.Total), Money(r.Cash)
            ]),
            ["Total", Count(rows.Sum(r => r.Count)), Money(rows.Sum(r => r.Sub)), Money(rows.Sum(r => r.Tax)),
                Money(rows.Sum(r => r.Total)), Money(rows.Sum(r => r.Cash))]);
    }

    private async Task<ReportResultDto?> SalesByClientAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var invoices = await BilledAsync(from, to, ct);
        var rows = invoices.GroupBy(i => i.ClientName)
            .Select(g => (Client: g.Key, Count: g.Count(), Sub: g.Sum(i => i.Subtotal), Total: g.Sum(i => i.Total),
                Paid: g.Sum(i => i.Paid), Balance: g.Sum(i => i.Balance)))
            .OrderByDescending(r => r.Sub)
            .ToList();

        return Result(ReportKeys.SalesByClient, PeriodLabel(from, to),
            [Text("Client"), Num("Factures"), Num("Avant taxes"), Num("Total"), Num("Payé"), Num("Solde")],
            rows.Select(r => (IReadOnlyList<string>)
                [r.Client, Count(r.Count), Money(r.Sub), Money(r.Total), Money(r.Paid), Money(r.Balance)]),
            ["Total", Count(rows.Sum(r => r.Count)), Money(rows.Sum(r => r.Sub)), Money(rows.Sum(r => r.Total)),
                Money(rows.Sum(r => r.Paid)), Money(rows.Sum(r => r.Balance))]);
    }

    private async Task<ReportResultDto?> SalesByProductAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var lines = await db.InvoiceLines.AsNoTracking()
            .Where(l => l.Invoice!.Status != InvoiceStatus.Brouillon && l.Invoice.Status != InvoiceStatus.Annulee
                && l.Invoice.IssueDate >= from && l.Invoice.IssueDate <= to)
            .Select(l => new
            {
                l.ProductId,
                Name = l.Product != null ? l.Product.Title : l.Description,
                Code = l.Product != null ? l.Product.Code : null,
                l.Quantity,
                l.UnitPrice,
                l.PurchasePrice
            })
            .ToListAsync(ct);

        // Catalogue products together; a line typed by hand stays its own row, by its words.
        var rows = lines.GroupBy(l => l.ProductId?.ToString() ?? "texte:" + l.Name)
            .Select(g => (Code: g.First().Code, Name: g.First().Name, Qty: g.Sum(l => l.Quantity),
                Revenue: g.Sum(l => l.Quantity * l.UnitPrice), Cost: g.Sum(l => l.Quantity * (l.PurchasePrice ?? 0m))))
            .OrderByDescending(r => r.Revenue)
            .ToList();

        return Result(ReportKeys.SalesByProduct, PeriodLabel(from, to),
            [Text("Produit"), Text("Code"), Num("Quantité"), Num("Vendant"), Num("Coût"), Num("Bénéfice"), Num("Marge")],
            rows.Select(r => (IReadOnlyList<string>)
            [
                r.Name, r.Code ?? "", Qty(r.Qty), Money(r.Revenue), Money(r.Cost), Money(r.Revenue - r.Cost),
                Percent(r.Revenue - r.Cost, r.Revenue)
            ]),
            ["Total", "", "", Money(rows.Sum(r => r.Revenue)), Money(rows.Sum(r => r.Cost)),
                Money(rows.Sum(r => r.Revenue - r.Cost)), Percent(rows.Sum(r => r.Revenue - r.Cost), rows.Sum(r => r.Revenue))]);
    }

    // ---- Facturation ----

    /// <summary>What is owed today, whatever the period: an unpaid invoice from last year is still owed.</summary>
    private async Task<ReportResultDto?> UnpaidInvoicesAsync(CancellationToken ct)
    {
        var today = Common.BusinessDay.Today;
        var rows = (await BilledAsync(null, null, ct))
            .Where(i => i.Balance > 0)
            .OrderBy(i => i.DueDate)
            .ToList();

        return Result(ReportKeys.UnpaidInvoices, $"Au {today.ToString("d MMMM yyyy", Culture)}",
            [Text("Facture"), Text("Client"), Text("Date"), Text("Échéance"), Num("Retard"), Num("Total"), Num("Solde")],
            rows.Select(r => (IReadOnlyList<string>)
            [
                r.Number, r.ClientName, r.IssueDate.ToString("yyyy-MM-dd", Culture), r.DueDate.ToString("yyyy-MM-dd", Culture),
                r.DueDate < today ? $"{today.DayNumber - r.DueDate.DayNumber} j" : "—", Money(r.Total), Money(r.Balance)
            ]),
            ["Total", "", "", "", "", Money(rows.Sum(r => r.Total)), Money(rows.Sum(r => r.Balance))]);
    }

    private static readonly Dictionary<PaymentMethod, string> MethodLabels = new()
    {
        [PaymentMethod.Comptant] = "Comptant",
        [PaymentMethod.Interac] = "Interac",
        [PaymentMethod.Carte] = "Carte",
        [PaymentMethod.Cheque] = "Chèque",
        [PaymentMethod.Virement] = "Virement"
    };

    private async Task<ReportResultDto?> PaymentsReceivedAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var rows = await db.InvoicePayments.AsNoTracking()
            .Where(p => p.Date >= from && p.Date <= to)
            .OrderBy(p => p.Date)
            .Select(p => new { p.Date, p.Invoice!.Number, Client = p.Invoice.Client!.Name, p.Method, p.Reference, p.Amount })
            .ToListAsync(ct);

        return Result(ReportKeys.PaymentsReceived, PeriodLabel(from, to),
            [Text("Date"), Text("Facture"), Text("Client"), Text("Mode"), Text("Référence"), Num("Montant")],
            rows.Select(r => (IReadOnlyList<string>)
            [
                r.Date.ToString("yyyy-MM-dd", Culture), r.Number, r.Client,
                MethodLabels.GetValueOrDefault(r.Method, r.Method.ToString()), r.Reference ?? "", Money(r.Amount)
            ]),
            ["Total", "", "", "", "", Money(rows.Sum(r => r.Amount))]);
    }

    /// <summary>What each client owes today, by age — the list a statement run starts from.</summary>
    private async Task<ReportResultDto?> ClientBalancesAsync(CancellationToken ct)
    {
        var today = Common.BusinessDay.Today;
        var rows = (await BilledAsync(null, null, ct))
            .Where(i => i.Balance > 0)
            .GroupBy(i => i.ClientName)
            .Select(g =>
            {
                decimal Bucket(Func<int, bool> late) => g.Where(i => late(today.DayNumber - i.DueDate.DayNumber)).Sum(i => i.Balance);
                return (Client: g.Key, Current: Bucket(d => d <= 0), D30: Bucket(d => d is > 0 and <= 30),
                    D60: Bucket(d => d is > 30 and <= 60), Over: Bucket(d => d > 60), Total: g.Sum(i => i.Balance));
            })
            .OrderByDescending(r => r.Total)
            .ToList();

        return Result(ReportKeys.ClientBalances, $"Au {today.ToString("d MMMM yyyy", Culture)}",
            [Text("Client"), Num("Courant"), Num("1 à 30 j"), Num("31 à 60 j"), Num("Plus de 60 j"), Num("Total")],
            rows.Select(r => (IReadOnlyList<string>)
                [r.Client, Money(r.Current), Money(r.D30), Money(r.D60), Money(r.Over), Money(r.Total)]),
            ["Total", Money(rows.Sum(r => r.Current)), Money(rows.Sum(r => r.D30)), Money(rows.Sum(r => r.D60)),
                Money(rows.Sum(r => r.Over)), Money(rows.Sum(r => r.Total))]);
    }

    // ---- Inventaire ----

    private async Task<ReportResultDto?> InventoryValueAsync(CancellationToken ct)
    {
        var rows = await db.Products.AsNoTracking()
            .Where(p => !p.IsParent && p.QuantityOnHand != 0)
            .OrderBy(p => p.Title)
            .Select(p => new { p.Code, p.Title, p.QuantityOnHand, p.PurchasePrice, p.SellingPrice })
            .ToListAsync(ct);

        return Result(ReportKeys.InventoryValue, "Au prix d'achat",
            [Text("Produit"), Text("Code"), Num("En stock"), Num("Prix d'achat"), Num("Valeur au coût"), Num("Valeur de vente")],
            rows.Select(r => (IReadOnlyList<string>)
            [
                r.Title, r.Code ?? "", Qty(r.QuantityOnHand), r.PurchasePrice is { } p ? Money(p) : "—",
                Money(r.QuantityOnHand * (r.PurchasePrice ?? 0m)), Money(r.QuantityOnHand * (r.SellingPrice ?? 0m))
            ]),
            ["Total", "", "", "", Money(rows.Sum(r => r.QuantityOnHand * (r.PurchasePrice ?? 0m))),
                Money(rows.Sum(r => r.QuantityOnHand * (r.SellingPrice ?? 0m)))]);
    }

    private async Task<ReportResultDto?> InventoryBelowMinimumAsync(CancellationToken ct)
    {
        var rows = await db.Products.AsNoTracking()
            .Where(p => !p.IsParent && p.MinimumQuantity != null && p.QuantityOnHand <= p.MinimumQuantity)
            .OrderBy(p => p.Title)
            .Select(p => new { p.Code, p.Title, p.QuantityOnHand, p.MinimumQuantity, p.MaximumQuantity, p.PurchasePrice })
            .ToListAsync(ct);

        return Result(ReportKeys.InventoryBelowMinimum, null,
            [Text("Produit"), Text("Code"), Num("En stock"), Num("Minimum"), Num("À commander"), Num("Coût estimé")],
            rows.Select(r =>
            {
                // Up to the maximum when there is one, back to the minimum otherwise.
                var target = r.MaximumQuantity ?? r.MinimumQuantity ?? 0m;
                var order = Math.Max(0m, target - r.QuantityOnHand);
                return (IReadOnlyList<string>)
                [
                    r.Title, r.Code ?? "", Qty(r.QuantityOnHand), Qty(r.MinimumQuantity ?? 0m), Qty(order),
                    Money(order * (r.PurchasePrice ?? 0m))
                ];
            }),
            null);
    }

    // ---- Achats ----

    private async Task<ReportResultDto?> ExpensesByTypeAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var rows = await db.ProjectExpenses.AsNoTracking()
            .Where(e => e.SpentOn != null && e.SpentOn >= from && e.SpentOn <= to)
            .GroupBy(e => e.ExpenseType!.Name)
            .Select(g => new { Type = g.Key, Count = g.Count(), Cost = g.Sum(e => e.Cost ?? 0m), Selling = g.Sum(e => e.SellingPrice ?? 0m) })
            .ToListAsync(ct);
        var ordered = rows.OrderByDescending(r => r.Cost).ToList();

        return Result(ReportKeys.ExpensesByType, PeriodLabel(from, to),
            [Text("Type"), Num("Dépenses"), Num("Coût"), Num("Refacturé")],
            ordered.Select(r => (IReadOnlyList<string>)[r.Type, Count(r.Count), Money(r.Cost), Money(r.Selling)]),
            ["Total", Count(ordered.Sum(r => r.Count)), Money(ordered.Sum(r => r.Cost)), Money(ordered.Sum(r => r.Selling))]);
    }

    private async Task<ReportResultDto?> PurchasesBySupplierAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var orders = await db.PurchaseOrders.AsNoTracking()
            .Where(o => o.Status != PurchaseOrderStatus.Brouillon && o.Status != PurchaseOrderStatus.Annulee
                && o.OrderedOn >= from && o.OrderedOn <= to)
            .Select(o => new { Supplier = o.Supplier!.Name, Total = o.Lines.Sum(l => l.Quantity * l.UnitCost) })
            .ToListAsync(ct);
        var rows = orders.GroupBy(o => o.Supplier)
            .Select(g => (Supplier: g.Key, Count: g.Count(), Total: g.Sum(o => o.Total)))
            .OrderByDescending(r => r.Total)
            .ToList();

        return Result(ReportKeys.PurchasesBySupplier, PeriodLabel(from, to),
            [Text("Fournisseur"), Num("Commandes"), Num("Total")],
            rows.Select(r => (IReadOnlyList<string>)[r.Supplier, Count(r.Count), Money(r.Total)]),
            ["Total", Count(rows.Sum(r => r.Count)), Money(rows.Sum(r => r.Total))]);
    }

    // ---- Production ----

    /// <summary>
    /// Every project started or created in the period, with the same arithmetic as its totals
    /// table: what it cost, what it sells for, and what was billed on it so far.
    /// </summary>
    private async Task<ReportResultDto?> ProjectProfitabilityAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var fromMoment = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toMoment = new DateTimeOffset(to.ToDateTime(TimeOnly.MaxValue), TimeSpan.Zero);
        var projects = await db.Projects.AsNoTracking()
            .Where(p => p.Status != ProjectStatus.Annule
                && ((p.StartDate != null && p.StartDate >= from && p.StartDate <= to)
                    || (p.StartDate == null && p.CreatedAt >= fromMoment && p.CreatedAt <= toMoment)))
            .OrderBy(p => p.Number)
            .Select(p => new { p.Id, p.Number, Client = p.Client!.Name, p.Status })
            .ToListAsync(ct);
        var ids = projects.Select(p => p.Id).ToList();
        var rate = await db.BillingSettings.AsNoTracking().Select(b => b.DefaultHourlyRate).FirstOrDefaultAsync(ct) ?? 0m;

        async Task<Dictionary<Guid, (decimal Cost, decimal Revenue)>> Sum<T>(IQueryable<T> rows, Func<T, Guid> project, Func<T, decimal> cost, Func<T, decimal> revenue)
        {
            var list = await rows.ToListAsync(ct);
            return list.GroupBy(project).ToDictionary(g => g.Key, g => (g.Sum(cost), g.Sum(revenue)));
        }

        var materials = await Sum(db.ProjectMaterials.AsNoTracking().Where(m => ids.Contains(m.ProjectId) && m.ProjectAssemblyId == null),
            m => m.ProjectId, m => m.Quantity * (m.PurchasePrice ?? 0m), m => m.Quantity * m.UnitPrice);
        var equipment = await Sum(db.ProjectEquipment.AsNoTracking().Where(m => ids.Contains(m.ProjectId)),
            m => m.ProjectId, m => m.Quantity * (m.CostRate ?? 0m), m => m.Quantity * (m.SellingRate ?? 0m));
        var assemblies = await Sum(db.ProjectAssemblies.AsNoTracking().Where(m => ids.Contains(m.ProjectId)),
            m => m.ProjectId, m => m.Quantity * m.UnitCost, m => m.Quantity * m.UnitPrice);
        var labour = await Sum(db.TimesheetEntries.AsNoTracking().Where(m => ids.Contains(m.ProjectId)),
            m => m.ProjectId, _ => 0m, m => m.Hours * (m.HourlyRate ?? rate));
        var expenses = await Sum(db.ProjectExpenses.AsNoTracking().Where(m => ids.Contains(m.ProjectId)),
            m => m.ProjectId, m => m.Cost ?? 0m, m => m.SellingPrice ?? 0m);
        var charges = await Sum(db.ProjectExtraCharges.AsNoTracking().Where(m => ids.Contains(m.ProjectId)),
            m => m.ProjectId, m => m.Cost ?? 0m, m => m.SellingPrice ?? 0m);
        var settings = await db.BillingSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var invoiced = (await db.Invoices.AsNoTracking().Include(i => i.Lines)
                .Where(i => i.ProjectId != null && ids.Contains(i.ProjectId.Value)
                    && i.Status != InvoiceStatus.Brouillon && i.Status != InvoiceStatus.Annulee)
                .ToListAsync(ct))
            .GroupBy(i => i.ProjectId!.Value)
            .ToDictionary(g => g.Key, g => g.Sum(i => InvoiceTotals.For(i.Lines, settings, i.IsTaxExempt).Subtotal));

        var rows = projects.Select(p =>
        {
            var parts = new[] { materials, equipment, assemblies, labour, expenses, charges }
                .Select(d => d.GetValueOrDefault(p.Id)).ToList();
            var cost = parts.Sum(x => x.Cost);
            var revenue = parts.Sum(x => x.Revenue);
            return (p.Number, p.Client, p.Status, Cost: cost, Revenue: revenue, Billed: invoiced.GetValueOrDefault(p.Id));
        }).ToList();

        return Result(ReportKeys.ProjectProfitability, PeriodLabel(from, to),
            [Text("Projet"), Text("Client"), Text("Statut"), Num("Coût"), Num("Vendant"), Num("Bénéfice"), Num("Marge"), Num("Facturé")],
            rows.Select(r => (IReadOnlyList<string>)
            [
                $"P-{r.Number:0000}", r.Client, StatusLabels.GetValueOrDefault(r.Status, r.Status.ToString()),
                Money(r.Cost), Money(r.Revenue), Money(r.Revenue - r.Cost), Percent(r.Revenue - r.Cost, r.Revenue), Money(r.Billed)
            ]),
            ["Total", "", "", Money(rows.Sum(r => r.Cost)), Money(rows.Sum(r => r.Revenue)),
                Money(rows.Sum(r => r.Revenue - r.Cost)), Percent(rows.Sum(r => r.Revenue - r.Cost), rows.Sum(r => r.Revenue)),
                Money(rows.Sum(r => r.Billed))]);
    }

    /// <summary>The work finished in the period, per person or crew: tasks, estimate against hours.</summary>
    private async Task<ReportResultDto?> CompletedTasksAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var fromMoment = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toMoment = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var tasks = await db.ProjectTasks.AsNoTracking()
            .Where(t => t.Status == ProjectTaskStatus.Terminee && t.CompletedAt >= fromMoment && t.CompletedAt < toMoment)
            .Select(t => new
            {
                t.Id,
                t.EstimatedHours,
                Team = t.AssignedTeam != null ? t.AssignedTeam.Name : null,
                People = t.Assignees.Select(a => a.FirstName + " " + a.LastName).ToList()
            })
            .ToListAsync(ct);
        var taskIds = tasks.Select(t => t.Id).ToList();
        var hours = await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.ProjectTaskId != null && taskIds.Contains(x.ProjectTaskId.Value))
            .GroupBy(x => x.ProjectTaskId!.Value)
            .Select(g => new { g.Key, Hours = g.Sum(x => x.Hours) })
            .ToDictionaryAsync(x => x.Key, x => x.Hours, ct);

        var rows = tasks
            .SelectMany(t => (t.People.Count > 0 ? t.People : [t.Team is { } team ? $"Équipe {team}" : "Non assignée"])
                .Select(owner => (Owner: owner, t.EstimatedHours, Hours: hours.GetValueOrDefault(t.Id))))
            .GroupBy(r => r.Owner)
            .Select(g => (Owner: g.Key, Count: g.Count(), Estimated: g.Sum(r => r.EstimatedHours ?? 0m), Hours: g.Sum(r => r.Hours)))
            .OrderByDescending(r => r.Count)
            .ToList();

        return Result(ReportKeys.CompletedTasks, PeriodLabel(from, to),
            [Text("Employé ou équipe"), Num("Tâches terminées"), Num("Heures estimées"), Num("Heures réelles"), Num("Écart")],
            rows.Select(r => (IReadOnlyList<string>)
                [r.Owner, Count(r.Count), Hours(r.Estimated), Hours(r.Hours), Hours(r.Hours - r.Estimated)]),
            ["Total", Count(tasks.Count), Hours(tasks.Sum(t => t.EstimatedHours ?? 0m)), Hours(hours.Values.Sum()), ""]);
    }

    // ---- Feuilles de temps et main-d'œuvre ----

    private async Task<ReportResultDto?> HoursByProjectAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var rows = await db.TimesheetEntries.AsNoTracking()
            .Where(t => t.StartDate >= from && t.StartDate <= to && t.PunchState == PunchState.Aucun)
            .GroupBy(t => new { t.Project!.Number, Client = t.Project.Client!.Name })
            .Select(g => new
            {
                g.Key.Number,
                g.Key.Client,
                Hours = g.Sum(t => t.Hours),
                People = g.Where(t => t.EmployeeId != null).Select(t => t.EmployeeId).Distinct().Count(),
                Entries = g.Count()
            })
            .ToListAsync(ct);
        var ordered = rows.OrderByDescending(r => r.Hours).ToList();

        return Result(ReportKeys.HoursByProject, PeriodLabel(from, to),
            [Text("Projet"), Text("Client"), Num("Heures"), Num("Employés"), Num("Entrées")],
            ordered.Select(r => (IReadOnlyList<string>)
                [$"P-{r.Number:0000}", r.Client, Hours(r.Hours), Count(r.People), Count(r.Entries)]),
            ["Total", "", Hours(ordered.Sum(r => r.Hours)), "", Count(ordered.Sum(r => r.Entries))]);
    }

    private async Task<(decimal Rate, List<(Guid? EmployeeId, string Employee, int Project, string Client, decimal Hours, decimal Value)>)> LabourAsync(
        DateOnly from, DateOnly to, CancellationToken ct)
    {
        var rate = await db.BillingSettings.AsNoTracking().Select(b => b.DefaultHourlyRate).FirstOrDefaultAsync(ct) ?? 0m;
        var entries = await db.TimesheetEntries.AsNoTracking()
            .Where(t => t.StartDate >= from && t.StartDate <= to && t.PunchState == PunchState.Aucun)
            .Select(t => new
            {
                t.EmployeeId,
                Employee = t.Employee != null ? t.Employee.FirstName + " " + t.Employee.LastName : null,
                t.Project!.Number,
                Client = t.Project.Client!.Name,
                t.Hours,
                t.HourlyRate
            })
            .ToListAsync(ct);
        return (rate, entries
            .Select(e => (e.EmployeeId, e.Employee ?? "Sans employé", e.Number, e.Client, e.Hours, e.Hours * (e.HourlyRate ?? rate)))
            .ToList());
    }

    private async Task<ReportResultDto?> LabourByEmployeeAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var (_, entries) = await LabourAsync(from, to, ct);
        var rows = entries.GroupBy(e => e.Employee)
            .Select(g => (Employee: g.Key, Hours: g.Sum(e => e.Hours), Value: g.Sum(e => e.Value), Projects: g.Select(e => e.Project).Distinct().Count()))
            .OrderByDescending(r => r.Value)
            .ToList();

        return Result(ReportKeys.LabourByEmployee, PeriodLabel(from, to),
            [Text("Employé"), Num("Projets"), Num("Heures"), Num("Taux moyen"), Num("Main-d'œuvre facturable")],
            rows.Select(r => (IReadOnlyList<string>)
                [r.Employee, Count(r.Projects), Hours(r.Hours), r.Hours > 0 ? Money(r.Value / r.Hours) : "—", Money(r.Value)]),
            ["Total", "", Hours(rows.Sum(r => r.Hours)),
                rows.Sum(r => r.Hours) > 0 ? Money(rows.Sum(r => r.Value) / rows.Sum(r => r.Hours)) : "—", Money(rows.Sum(r => r.Value))]);
    }

    private async Task<ReportResultDto?> LabourByProjectAsync(ReportPeriod period, CancellationToken ct)
    {
        var (from, to) = Resolve(period);
        var (_, entries) = await LabourAsync(from, to, ct);
        var rows = entries.GroupBy(e => (e.Project, e.Client))
            .Select(g => (g.Key.Project, g.Key.Client, Hours: g.Sum(e => e.Hours), Value: g.Sum(e => e.Value),
                People: g.Where(e => e.EmployeeId != null).Select(e => e.EmployeeId).Distinct().Count()))
            .OrderByDescending(r => r.Value)
            .ToList();

        return Result(ReportKeys.LabourByProject, PeriodLabel(from, to),
            [Text("Projet"), Text("Client"), Num("Employés"), Num("Heures"), Num("Taux moyen"), Num("Main-d'œuvre facturable")],
            rows.Select(r => (IReadOnlyList<string>)
            [
                $"P-{r.Project:0000}", r.Client, Count(r.People), Hours(r.Hours), r.Hours > 0 ? Money(r.Value / r.Hours) : "—", Money(r.Value)
            ]),
            ["Total", "", "", Hours(rows.Sum(r => r.Hours)),
                rows.Sum(r => r.Hours) > 0 ? Money(rows.Sum(r => r.Value) / rows.Sum(r => r.Hours)) : "—", Money(rows.Sum(r => r.Value))]);
    }
}
