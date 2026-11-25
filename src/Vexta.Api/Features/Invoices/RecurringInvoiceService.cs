using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.BillingSettings;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// Issues the invoices that come back on a schedule (<see cref="RecurringInvoice"/>): a copy of
/// the model invoice, dated the day it was planned for, numbered from the company's own counter.
///
/// When the schedule says to send it, it goes through the same Send as the button on the invoice
/// — the company's wording, the PDF, the pay button, the status — run inside the company as the
/// reminders are, rather than a second sending path that would drift from the first.
/// </summary>
public class RecurringInvoiceService(
    IServiceScopeFactory scopes,
    IHttpContextAccessor accessor,
    ILogger<RecurringInvoiceService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private const int MaxPerRun = 50;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Recurring invoice pass failed.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        List<(Guid Tenant, Guid Id)> due;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();
            var today = BusinessDay.Today;
            var now = DateTimeOffset.UtcNow;
            var rows = await db.RecurringInvoices.IgnoreQueryFilters().AsNoTracking()
                .Where(r => r.IsActive && r.NextIssueDate <= today)
                .Join(db.Tenants.IgnoreQueryFilters(), r => r.TenantId, t => t.Id, (r, t) => new { r, t })
                .Where(x => x.t.Kind == TenantKind.Business
                    && (x.t.SubscriptionStatus == TenantSubscriptionStatus.Active
                        || (x.t.SubscriptionStatus == TenantSubscriptionStatus.Trialing && x.t.TrialEndsAt > now)))
                .OrderBy(x => x.r.NextIssueDate)
                .Take(MaxPerRun)
                .Select(x => new { x.r.TenantId, x.r.Id })
                .ToListAsync(ct);
            due = [.. rows.Select(r => (r.TenantId, r.Id))];
        }

        foreach (var (tenant, id) in due)
        {
            try
            {
                await IssueAsync(tenant, id, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // One broken schedule must not hold up the others behind it.
                logger.LogError(ex, "Recurring invoice {RecurrenceId} failed.", id);
            }
        }
    }

    private async Task IssueAsync(Guid tenantId, Guid recurrenceId, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        accessor.HttpContext = new DefaultHttpContext
        {
            RequestServices = scope.ServiceProvider,
            User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(VextaClaimTypes.TenantId, tenantId.ToString()),
                new Claim(ClaimTypes.Role, nameof(UserRole.TenantAdmin))
            ], "RecurringInvoice"))
        };

        try
        {
            var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();
            var recurrence = await db.RecurringInvoices
                .Include(r => r.Client)
                .Include(r => r.SourceInvoice!).ThenInclude(i => i.Lines)
                .FirstOrDefaultAsync(r => r.Id == recurrenceId, ct);
            if (recurrence is null || !recurrence.IsActive) return;

            var issueDate = recurrence.NextIssueDate;
            if (recurrence.EndDate is { } end && issueDate > end)
            {
                recurrence.IsActive = false;
                await db.SaveChangesAsync(ct);
                return;
            }

            var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
            var source = recurrence.SourceInvoice!;
            string? problem = null;
            Invoice? invoice = null;

            if (settings is null)
            {
                problem = "Les paramètres de facturation ne sont pas remplis.";
            }
            else if (recurrence.Client!.WorkRefusal() is { } refusal)
            {
                // A client the company has closed gets no new invoice; the schedule waits.
                problem = refusal;
            }
            else
            {
                invoice = new Invoice
                {
                    TenantId = tenantId,
                    Number = InvoiceNumbering.Format(settings.InvoicePrefix, settings.NextInvoiceNumber),
                    ClientId = source.ClientId,
                    Status = InvoiceStatus.Brouillon,
                    IssueDate = issueDate,
                    DueDate = issueDate.AddDays(settings.PaymentTermsDays),
                    Currency = source.Currency,
                    Notes = source.Notes,
                    IsTaxExempt = source.IsTaxExempt,
                    PricePolicyId = source.PricePolicyId,
                    Lines = [.. source.Lines.OrderBy(l => l.SortOrder).Select(l => new InvoiceLine
                    {
                        Kind = l.Kind,
                        ProductId = l.ProductId,
                        Description = l.Description,
                        Quantity = l.Quantity,
                        PurchasePrice = l.PurchasePrice,
                        MarginPercent = l.MarginPercent,
                        UnitPrice = l.UnitPrice,
                        IsTaxable = l.IsTaxable,
                        SortOrder = l.SortOrder,
                    })],
                };
                settings.NextInvoiceNumber++;
                db.Invoices.Add(invoice);

                recurrence.Periods++;
                recurrence.NextIssueDate = recurrence.StartDate.AddMonths(recurrence.IntervalMonths * recurrence.Periods);
                recurrence.LastInvoiceId = invoice.Id;
                recurrence.LastIssuedAt = DateTimeOffset.UtcNow;
                if (recurrence.EndDate is { } last && recurrence.NextIssueDate > last) recurrence.IsActive = false;
            }

            recurrence.LastProblem = problem;
            recurrence.UpdatedAt = DateTimeOffset.UtcNow;
            // The invoice and the advanced schedule in one save: never one without the other, or
            // the next pass would issue the same period twice.
            await db.SaveChangesAsync(ct);

            if (invoice is null || !recurrence.AutoSend) return;

            var sendProblem = await SendAsync(scope.ServiceProvider, invoice.Id, ct);
            if (sendProblem is not null)
            {
                recurrence.LastProblem = $"La facture {invoice.Number} est restée en brouillon : {sendProblem}";
                await db.SaveChangesAsync(ct);
            }

            logger.LogInformation("Recurring invoice {RecurrenceId} issued {Number}{Sent}.",
                recurrenceId, invoice.Number, sendProblem is null ? " and sent" : "");
        }
        finally
        {
            accessor.HttpContext = null;
        }
    }

    /// <summary>
    /// Sends through the invoice's own Send, with the message its send form would have opened
    /// with. Returns why it did not go, or null once it has.
    /// </summary>
    private async Task<string?> SendAsync(IServiceProvider services, Guid invoiceId, CancellationToken ct)
    {
        var controller = ActivatorUtilities.CreateInstance<InvoicesController>(services);
        controller.ControllerContext = new ControllerContext { HttpContext = accessor.HttpContext! };

        var defaults = Unwrap(await controller.SendDefaults(invoiceId, ct));
        if (defaults is null) return "le message n'a pas pu être préparé.";
        if (defaults.To is not { Length: > 0 } to) return "le dossier du client n'a pas d'adresse courriel.";

        var sent = await controller.Send(
            invoiceId, new SendInvoiceRequest(to, null, defaults.Subject, defaults.Body, null, null), ct);
        if (Unwrap(sent) is not null) return null;

        return (sent.Result as ObjectResult)?.Value is { } value
            && value.GetType().GetProperty("message")?.GetValue(value) is string message
                ? message
                : "l'envoi a échoué.";
    }

    private static T? Unwrap<T>(ActionResult<T> result) where T : class =>
        result.Value ?? (result.Result as OkObjectResult)?.Value as T;
}
