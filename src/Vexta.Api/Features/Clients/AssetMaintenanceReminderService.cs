using System.Net;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Sends;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Clients;

/// <summary>
/// Writes to a client ahead of the maintenance planned on one of their assets, for the
/// schedules that ask for it (<see cref="AssetMaintenance.RemindDaysBefore"/>). Once per due
/// date: marking the visit done moves the date, and the next one is reminded in its turn.
///
/// Reads across companies with the filters off and every condition spelled out — the company
/// still subscribed, the asset still serviced — because nothing here renders a document that
/// needs a signed-in request around it.
/// </summary>
public class AssetMaintenanceReminderService(
    IServiceScopeFactory scopes,
    ILogger<AssetMaintenanceReminderService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private const int MaxPerRun = 100;

    /// <summary>
    /// How far back a missed date is still worth a message. A cleaning due last month is worth a
    /// nudge; one due last year, on a schedule just entered, is a record and not news.
    /// </summary>
    private const int StaleAfterDays = 30;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(75), stoppingToken); }
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
                logger.LogError(ex, "Asset maintenance reminder pass failed.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();
        var mailgun = scope.ServiceProvider.GetRequiredService<IMailgunService>();

        var today = BusinessDay.Today;
        var now = DateTimeOffset.UtcNow;
        var horizon = today.AddDays(90);
        var oldest = today.AddDays(-StaleAfterDays);

        // Narrowed in SQL to what could be due for a message; the exact "N days before" is
        // checked below, where the date arithmetic is plain C#.
        var candidates = await db.AssetMaintenances.IgnoreQueryFilters()
            .Where(m => m.RemindDaysBefore != null
                && m.NextDue <= horizon && m.NextDue >= oldest
                && (m.RemindedFor == null || m.RemindedFor != m.NextDue)
                && m.ClientAsset!.IsActive)
            .Join(db.Tenants.IgnoreQueryFilters(), m => m.TenantId, t => t.Id, (m, t) => new { m, t })
            .Where(x => x.t.Kind == TenantKind.Business
                && (x.t.SubscriptionStatus == TenantSubscriptionStatus.Active
                    || (x.t.SubscriptionStatus == TenantSubscriptionStatus.Trialing && x.t.TrialEndsAt > now)))
            .Select(x => x.m)
            .OrderBy(m => m.NextDue)
            .Take(MaxPerRun * 4)
            .ToListAsync(ct);

        var due = candidates
            .Where(m => m.NextDue.AddDays(-m.RemindDaysBefore!.Value) <= today)
            .Take(MaxPerRun)
            .ToList();
        if (due.Count == 0) return;

        var sent = 0;
        foreach (var maintenance in due)
        {
            var details = await db.ClientAssets.IgnoreQueryFilters().AsNoTracking()
                .Where(a => a.Id == maintenance.ClientAssetId)
                .Select(a => new
                {
                    a.Label, a.Make, a.Model, a.Year,
                    ClientName = a.Client!.Name,
                    ClientEmail = a.Client.Email,
                    Contact = a.Client.Contacts
                        .Where(c => c.Email != null && c.Email != "")
                        .OrderBy(c => c.LastName).ThenBy(c => c.FirstName)
                        .Select(c => new { c.Email, Name = (c.FirstName + " " + c.LastName).Trim() })
                        .FirstOrDefault(),
                })
                .FirstOrDefaultAsync(ct);
            if (details is null) continue;

            // The client's own address first, a contact's when the file has none.
            var (to, name) = !string.IsNullOrWhiteSpace(details.ClientEmail)
                ? (details.ClientEmail.Trim(), details.ClientName)
                : details.Contact is { } contact ? (contact.Email!.Trim(), contact.Name) : (null, details.ClientName);
            if (to is null) continue;

            var company = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
                .Where(t => t.Id == maintenance.TenantId)
                .Select(t => new { t.Name, t.ContactEmail, t.Phone })
                .FirstAsync(ct);

            var asset = new ClientAsset { Label = details.Label, Make = details.Make, Model = details.Model, Year = details.Year }.Designation;
            var body = AssetMaintenanceEmail.Build(
                company.Name, name, asset, maintenance.Label, maintenance.NextDue, company.ContactEmail, company.Phone);

            try
            {
                await mailgun.SendAsync(to, name, $"Entretien à prévoir : {asset} — {company.Name}", body, ct, company.Name);
            }
            catch (InvalidOperationException ex)
            {
                // Not recorded: the next pass tries again.
                logger.LogWarning("Maintenance reminder for {MaintenanceId} not sent: {Reason}", maintenance.Id, ex.Message);
                continue;
            }

            SendHistory.Add(db, maintenance.TenantId, "actif", maintenance.ClientAssetId, "Rappel d'entretien",
                to, $"Entretien à prévoir : {asset} — {company.Name}");

            maintenance.RemindedFor = maintenance.NextDue;
            maintenance.RemindedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            sent++;
        }

        if (sent > 0) logger.LogInformation("Sent {Count} maintenance reminder(s).", sent);
    }
}

/// <summary>The message: what, on which asset, around when, and how to reach the company.</summary>
public static class AssetMaintenanceEmail
{
    public static string Build(
        string companyName, string contactName, string asset, string label, DateOnly due,
        string? companyEmail, string? companyPhone)
    {
        var company = WebUtility.HtmlEncode(companyName);
        var contact = WebUtility.HtmlEncode(contactName);
        var what = WebUtility.HtmlEncode(label);
        var thing = WebUtility.HtmlEncode(asset);
        var date = due.ToString("d MMMM yyyy", Formats.Quebec);

        var reach = new List<string>();
        if (!string.IsNullOrWhiteSpace(companyPhone)) reach.Add($"au {WebUtility.HtmlEncode(companyPhone.Trim())}");
        if (!string.IsNullOrWhiteSpace(companyEmail))
        {
            var email = WebUtility.HtmlEncode(companyEmail.Trim());
            reach.Add($"à <a href=\"mailto:{email}\">{email}</a>");
        }
        var howTo = reach.Count == 0
            ? "Répondez à ce courriel ou communiquez avec nous pour prendre rendez-vous."
            : $"Pour prendre rendez-vous, joignez-nous {string.Join(" ou ", reach)}.";

        return $"""
            <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">
              <p>Bonjour {contact},</p>
              <p>
                Selon nos dossiers, le prochain « {what} » de votre {thing} est à prévoir vers le
                <strong>{date}</strong>.
              </p>
              <p>{howTo}</p>
              <p>{company}</p>
            </div>
            """;
    }
}
