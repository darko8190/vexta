using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Sends;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Quotes;

/// <summary>
/// Sends the reminder for quotes left unanswered, for the companies that asked for it
/// (<see cref="Domain.BillingSettings.QuoteReminderDays"/> days apart, up to
/// <see cref="Domain.BillingSettings.QuoteReminderCount"/> times). Counted per sending, to the address
/// the quote went to, with the built-in reminder wording and the PDF — what « Relancer » in the
/// send form would have sent.
///
/// Runs inside each company in turn, as if signed in to it, so the tenant filters, the PDF and
/// the portal link behave exactly as they do for a request: nothing here reads across companies
/// except the list of who asked.
/// </summary>
public class QuoteReminderService(
    IServiceScopeFactory scopes,
    IHttpContextAccessor accessor,
    IConfiguration configuration,
    ILogger<QuoteReminderService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    /// <summary>Few enough that a slow Mailgun cannot hold one run for long; the rest wait an hour.</summary>
    private const int MaxPerRun = 50;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app finish starting (migrations, warm-up) before the first pass.
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
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
                logger.LogError(ex, "Quote reminder pass failed.");
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
                .Where(b => b.QuoteReminderDays != null)
                .Join(db.Tenants.IgnoreQueryFilters(), b => b.TenantId, t => t.Id, (b, t) => new { b.TenantId, b.QuoteReminderDays, b.QuoteReminderCount, t })
                // The same rule as the subscription gate: a company that cannot open its
                // quotes does not have them chased in its name either.
                .Where(x => x.t.Kind == TenantKind.Business
                    && (x.t.SubscriptionStatus == TenantSubscriptionStatus.Active
                        || (x.t.SubscriptionStatus == TenantSubscriptionStatus.Trialing && x.t.TrialEndsAt > now)))
                .Select(x => new { x.TenantId, Days = x.QuoteReminderDays!.Value, Count = x.QuoteReminderCount })
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

        // The ambient request the rest of the app reads its tenant from. Set on this flow only:
        // the accessor keeps it in an AsyncLocal, so no real request ever sees it.
        accessor.HttpContext = new DefaultHttpContext
        {
            RequestServices = scope.ServiceProvider,
            User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(VextaClaimTypes.TenantId, tenantId.ToString()),
                new Claim(ClaimTypes.Role, nameof(UserRole.TenantAdmin))
            ], "QuoteReminder"))
        };

        try
        {
            var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();
            var pdf = scope.ServiceProvider.GetRequiredService<IInvoicePdfService>();
            var mailgun = scope.ServiceProvider.GetRequiredService<IMailgunService>();

            var cutoff = DateTimeOffset.UtcNow.AddDays(-days);
            var today = BusinessDay.Today;
            var due = await db.Quotes
                .Include(q => q.Client)
                .Include(q => q.Lines)
                .Where(q => q.TenantId == tenantId
                    && q.Status == QuoteStatus.Envoyee
                    && q.ProjectId == null && q.InvoiceId == null
                    && q.SentTo != null && q.SentAt != null
                    && q.ReminderCount < count
                    // The first one counts from the sending, each next one from the last.
                    && (q.ReminderCount == 0 ? q.SentAt <= cutoff : q.ReminderSentAt <= cutoff)
                    // A quote past its date is expiring, not waiting: a reminder would offer a
                    // price that no longer holds.
                    && (q.ValidUntil == null || q.ValidUntil >= today))
                .OrderBy(q => q.SentAt)
                .Take(budget)
                .ToListAsync(ct);
            if (due.Count == 0) return 0;

            var settings = await db.BillingSettings.AsNoTracking().FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
            var company = await QuoteMail.CompanyNameAsync(db, tenantId, ct);
            var frontendUrl = configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

            var sent = 0;
            foreach (var quote in due)
            {
                var to = quote.SentTo!;
                var name = await QuoteMail.DisplayNameAsync(db, quote, to, ct);
                var values = await QuoteMail.ValuesAsync(db, quote, settings, company, name, frontendUrl, ct);
                var subject = QuoteEmailTemplate.Render(QuoteEmailTemplate.ReminderSubject, values, isBody: false);
                var body = EmailText.ToHtml(QuoteEmailTemplate.Render(QuoteEmailTemplate.ReminderBody, values, isBody: true));

                var rendered = await pdf.RenderQuoteAsync(quote.Id, ct);
                if (rendered is not { } document) continue;

                try
                {
                    await mailgun.SendWithAttachmentsAsync(
                        to, name, subject, body, [],
                        [new EmailAttachment(QuoteMail.AttachmentName(quote), "application/pdf", document.Bytes)],
                        ct, company);
                }
                catch (InvalidOperationException ex)
                {
                    // Not recorded: the next pass tries again, as a person would on a failed send.
                    logger.LogWarning("Quote reminder for {QuoteId} not sent: {Reason}", quote.Id, ex.Message);
                    continue;
                }

                SendHistory.Add(db, quote.TenantId, "soumission", quote.Id, "Relance", to, subject);

                quote.ReminderSentAt = DateTimeOffset.UtcNow;
                quote.ReminderCount++;
                await db.SaveChangesAsync(ct);
                sent++;
            }

            if (sent > 0) logger.LogInformation("Sent {Count} quote reminder(s) for tenant {TenantId}.", sent, tenantId);
            return due.Count;
        }
        finally
        {
            accessor.HttpContext = null;
        }
    }
}
