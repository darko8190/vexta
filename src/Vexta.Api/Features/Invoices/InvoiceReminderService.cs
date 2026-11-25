using System.Net;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// Reminds clients of unpaid invoices, for the companies that asked for it
/// (<see cref="Domain.BillingSettings.InvoiceReminderDays"/> days past the due date, then as
/// many more as <see cref="Domain.BillingSettings.InvoiceReminderCount"/> allows, each that many
/// days after the last). Counted per sending, to the address the invoice went to, with the PDF, the balance still owed and — when
/// the company takes cards — the same « Payer en ligne » button as the original message.
///
/// Built like the quote's reminder (QuoteReminderService): each company in turn, as if signed in
/// to it, so the tenant filters and the PDF behave as they do for a request.
/// </summary>
public class InvoiceReminderService(
    IServiceScopeFactory scopes,
    IHttpContextAccessor accessor,
    IConfiguration configuration,
    ILogger<InvoiceReminderService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private const int MaxPerRun = 50;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // After the quote's pass, so the two do not both open with a burst of PDFs.
        try { await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken); }
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
                logger.LogError(ex, "Invoice reminder pass failed.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        List<(Guid TenantId, int Days, int Count)> companies;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();
            var now = DateTimeOffset.UtcNow;
            var rows = await db.BillingSettings.IgnoreQueryFilters().AsNoTracking()
                .Where(b => b.InvoiceReminderDays != null)
                .Join(db.Tenants.IgnoreQueryFilters(), b => b.TenantId, t => t.Id, (b, t) => new { b.TenantId, b.InvoiceReminderDays, b.InvoiceReminderCount, t })
                .Where(x => x.t.Kind == TenantKind.Business
                    && (x.t.SubscriptionStatus == TenantSubscriptionStatus.Active
                        || (x.t.SubscriptionStatus == TenantSubscriptionStatus.Trialing && x.t.TrialEndsAt > now)))
                .Select(x => new { x.TenantId, Days = x.InvoiceReminderDays!.Value, Count = x.InvoiceReminderCount })
                .ToListAsync(ct);
            companies = [.. rows.Select(r => (r.TenantId, r.Days, r.Count))];
        }

        var budget = MaxPerRun;
        foreach (var (tenantId, days, count) in companies)
        {
            if (budget <= 0) break;
            budget -= await RemindForTenantAsync(tenantId, days, count, budget, ct);
        }
    }

    private async Task<int> RemindForTenantAsync(Guid tenantId, int days, int count, int budget, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();

        accessor.HttpContext = new DefaultHttpContext
        {
            RequestServices = scope.ServiceProvider,
            User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(VextaClaimTypes.TenantId, tenantId.ToString()),
                new Claim(ClaimTypes.Role, nameof(UserRole.TenantAdmin))
            ], "InvoiceReminder"))
        };

        try
        {
            var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();
            var pdf = scope.ServiceProvider.GetRequiredService<IInvoicePdfService>();
            var mailgun = scope.ServiceProvider.GetRequiredService<IMailgunService>();
            var features = scope.ServiceProvider.GetRequiredService<IFeatureService>();

            var lastDueDate = BusinessDay.Today.AddDays(-days);
            var cutoff = DateTimeOffset.UtcNow.AddDays(-days);
            var candidates = await db.Invoices
                .Include(i => i.Client)
                .Include(i => i.Lines)
                .Where(i => i.TenantId == tenantId
                    && (i.Status == InvoiceStatus.Envoyee || i.Status == InvoiceStatus.EnRetard)
                    && i.SentTo != null && i.SentAt != null
                    && i.ReminderCount < count
                    // The first one counts from the due date, each next one from the last.
                    && (i.ReminderCount == 0 ? i.DueDate <= lastDueDate : i.ReminderSentAt <= cutoff))
                .OrderBy(i => i.DueDate)
                .Take(budget)
                .ToListAsync(ct);
            if (candidates.Count == 0) return 0;

            var settings = await db.BillingSettings.AsNoTracking().FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
            var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
                .Where(t => t.Id == tenantId)
                .Select(t => new { t.Name, t.StripeAccountId, t.StripeChargesEnabled })
                .FirstAsync(ct);
            var takesCards = tenant.StripeAccountId != null && tenant.StripeChargesEnabled
                && await features.IsEnabledAsync(FeatureKeys.Payments, tenantId, ct);
            var frontendUrl = configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

            var ids = candidates.Select(i => i.Id).ToList();
            var paid = await db.InvoicePayments
                .Where(p => ids.Contains(p.InvoiceId))
                .GroupBy(p => p.InvoiceId)
                .Select(g => new { g.Key, Amount = g.Sum(p => p.Amount) })
                .ToDictionaryAsync(x => x.Key, x => x.Amount, ct);
            var refunded = await InvoiceSettlement.RefundedByInvoiceAsync(db.InvoiceRefunds, ids, ct);
            var credited = await InvoiceSettlement.CreditedByInvoiceAsync(db.InvoiceCredits, ids, ct);

            var sent = 0;
            foreach (var invoice in candidates)
            {
                var total = InvoiceTotals.For(invoice.Lines, settings, invoice.IsTaxExempt).Total;
                var owed = InvoiceSettlement.Outstanding(
                    total,
                    credited.GetValueOrDefault(invoice.Id),
                    InvoiceSettlement.Net(paid.GetValueOrDefault(invoice.Id), refunded.GetValueOrDefault(invoice.Id)));

                // Settled another way (cash, a credit note) without the status catching up:
                // nothing to chase.
                if (owed <= 0) continue;

                var to = invoice.SentTo!;
                var name = await DisplayNameAsync(db, invoice, to, ct);

                var bytes = await pdf.RenderAsync(invoice.Id, ct);
                if (bytes is null) continue;

                var body = InvoiceReminderEmail.Build(tenant.Name, name, invoice.Number, invoice.DueDate, owed);
                if (takesCards)
                {
                    var url = InvoicePayLink.Url(frontendUrl, InvoicePayLink.EnsureToken(invoice));
                    body += await InvoicesController.PaymentBlock(db, tenantId, url, ct);
                }

                try
                {
                    await mailgun.SendWithAttachmentsAsync(
                        to, name, $"Rappel : facture {invoice.Number} — {tenant.Name}", body, [],
                        [new EmailAttachment($"Facture-{invoice.Number}.pdf", "application/pdf", bytes)],
                        ct, tenant.Name);
                }
                catch (InvalidOperationException ex)
                {
                    // Not recorded: the next pass tries again.
                    logger.LogWarning("Invoice reminder for {InvoiceId} not sent: {Reason}", invoice.Id, ex.Message);
                    continue;
                }

                invoice.ReminderSentAt = DateTimeOffset.UtcNow;
                invoice.ReminderCount++;
                // Past due and unpaid is what « En retard » means; a reminder is the moment it is
                // said out loud, so the list says it too.
                if (invoice.Status == InvoiceStatus.Envoyee) invoice.Status = InvoiceStatus.EnRetard;
                invoice.UpdatedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
                sent++;
            }

            if (sent > 0) logger.LogInformation("Sent {Count} invoice reminder(s) for tenant {TenantId}.", sent, tenantId);
            return candidates.Count;
        }
        finally
        {
            accessor.HttpContext = null;
        }
    }

    /// <summary>The client's name when it went to the client's own address, a contact's when to theirs.</summary>
    private static async Task<string> DisplayNameAsync(VextaDbContext db, Invoice invoice, string to, CancellationToken ct)
    {
        if (string.Equals(invoice.Client?.Email?.Trim(), to, StringComparison.OrdinalIgnoreCase))
            return invoice.Client!.Name;

        var lower = to.ToLower();
        var contact = await db.ClientContacts.AsNoTracking()
            .Where(c => c.ClientId == invoice.ClientId && c.Email != null && c.Email.ToLower() == lower)
            .Select(c => (c.FirstName + " " + c.LastName).Trim())
            .FirstOrDefaultAsync(ct);

        return string.IsNullOrWhiteSpace(contact) ? invoice.Client?.Name ?? to : contact;
    }
}

/// <summary>The reminder's wording. Short and polite: most late invoices are forgotten, not disputed.</summary>
public static class InvoiceReminderEmail
{
    public static string Build(string companyName, string contactName, string number, DateOnly dueDate, decimal owed)
    {
        var company = WebUtility.HtmlEncode(companyName);
        var contact = WebUtility.HtmlEncode(contactName);
        var invoice = WebUtility.HtmlEncode(number);
        var due = dueDate.ToString("d MMMM yyyy", Formats.Quebec);

        return $"""
            <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">
              <p>Bonjour {contact},</p>
              <p>
                Petit rappel : la facture {invoice} de {company} était payable le {due}. Selon nos
                dossiers, il reste <strong>{InvoiceEmailTemplate.Money(owed)}</strong> à régler.
              </p>
              <p>Vous la trouverez en pièce jointe. Si le paiement est déjà en route, merci, et ne tenez pas compte de ce message.</p>
              <p>{company}</p>
            </div>
            """;
    }
}
