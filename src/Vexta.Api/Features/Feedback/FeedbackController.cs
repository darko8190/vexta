using System.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Feedback;

/// <summary>
/// A bug report or a suggestion, sent from the bug button in the app's top bar. It is kept, so the
/// sender can follow it in « Mes demandes » and the super admin can move it along, and it is
/// still e-mailed to the super admins so nothing waits for someone to open a table. Who sent it
/// and from where is read from the session, never from the request body.
///
/// Not behind the subscription gate on purpose: a company whose payment failed is exactly the
/// one that may need to tell us something is wrong.
/// </summary>
[ApiController]
[Route("api/feedback")]
[Authorize]
[StaffOnly]
public class FeedbackController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IMailgunService mailgun,
    ILogger<FeedbackController> logger) : ControllerBase
{
    public const int MaxMessageLength = 5000;

    /// <summary>A screenshot, not a video: enough to show what the screen looked like.</summary>
    private const int MaxScreenshotBytes = 5 * 1024 * 1024;

    private static readonly Dictionary<string, string> ScreenshotTypes = new()
    {
        ["image/png"] = "png",
        ["image/jpeg"] = "jpg",
        ["image/webp"] = "webp",
    };

    [HttpPost]
    public async Task<IActionResult> Send(SendFeedbackRequest request, CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Unauthorized();

        var kind = request.Kind?.Trim().ToLowerInvariant();
        if (kind is not ("bug" or "suggestion"))
            return BadRequest(new { message = "Indiquez s'il s'agit d'un bogue ou d'une suggestion." });

        var message = request.Message?.Trim();
        if (string.IsNullOrEmpty(message))
            return BadRequest(new { message = "Décrivez le bogue ou la suggestion." });
        if (message.Length > MaxMessageLength)
            return BadRequest(new { message = $"Le message dépasse {MaxMessageLength} caractères." });

        EmailAttachment? screenshot = null;
        if (!string.IsNullOrWhiteSpace(request.Screenshot))
        {
            screenshot = ReadScreenshot(request.Screenshot);
            if (screenshot is null)
                return BadRequest(new { message = "La capture doit être une image PNG, JPEG ou WebP de 5 Mo au plus." });
        }

        // The super admin reads every space, so the sender is looked up past the tenant filter.
        var sender = await db.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.FirstName, u.LastName, u.Email, u.Role })
            .FirstOrDefaultAsync(ct);
        if (sender is null) return Unauthorized();

        var tenant = currentUser.TenantId is { } tenantId
            ? await db.Tenants.IgnoreQueryFilters().AsNoTracking()
                .Where(t => t.Id == tenantId)
                .Select(t => new { t.Id, t.Name, t.Kind })
                .FirstOrDefaultAsync(ct)
            : null;

        var senderName = $"{sender.FirstName} {sender.LastName}".Trim();

        // Kept first: the e-mail is a notice, the row is the request itself.
        var report = new FeedbackReport
        {
            TenantId = tenant?.Id,
            TenantName = tenant?.Name,
            UserId = userId,
            SenderName = senderName,
            SenderEmail = sender.Email ?? "",
            Kind = kind,
            Message = message,
            PageUrl = request.PageUrl is { Length: > 500 } url ? url[..500] : request.PageUrl,
            Screenshot = screenshot?.Content,
            ScreenshotType = screenshot?.ContentType,
        };
        db.FeedbackReports.Add(report);
        await db.SaveChangesAsync(ct);

        var recipients = await db.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => u.Role == UserRole.SuperAdmin && u.Email != null)
            .Select(u => new { u.Email, u.FirstName, u.LastName })
            .ToListAsync(ct);
        if (recipients.Count == 0 || !await mailgun.IsConfiguredAsync(ct))
        {
            logger.LogWarning("Feedback {ReportId} was saved but not e-mailed: no super admin address or Mailgun unconfigured.", report.Id);
            return Ok(ToDto(report));
        }

        var label = kind == "bug" ? "Bogue" : "Suggestion";
        var subject = tenant is null
            ? $"[Vexta] {label} de {senderName}"
            : $"[Vexta] {label} de {senderName} ({tenant.Name})";

        var body = FeedbackEmail.Build(
            label,
            senderName,
            sender.Email ?? "",
            RoleLabel(sender.Role),
            userId,
            tenant?.Name,
            tenant is null ? null : tenant.Kind == TenantKind.Personal ? "Espace personnel" : "Espace entreprise",
            tenant?.Id,
            currentUser.IsImpersonating,
            request.PageUrl,
            Request.Headers.UserAgent.ToString(),
            BusinessDay.ToLocal(DateTimeOffset.UtcNow),
            message);

        try
        {
            // One message per super admin rather than everyone in copy: their addresses are not
            // each other's business, and one bad address must not stop the others.
            foreach (var recipient in recipients)
            {
                var name = $"{recipient.FirstName} {recipient.LastName}".Trim();
                if (screenshot is null)
                    await mailgun.SendAsync(recipient.Email!, name, subject, body, ct);
                else
                    await mailgun.SendWithAttachmentsAsync(recipient.Email!, name, subject, body, [], [screenshot], ct);
            }
        }
        catch (InvalidOperationException ex)
        {
            // Saved all the same, and visible in the super admin's table.
            logger.LogError(ex, "Feedback {ReportId} was saved but the e-mail failed.", report.Id);
        }

        return Ok(ToDto(report));
    }

    /// <summary>The sender's own requests, newest first, from every space they sent them from.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<FeedbackDto>>> Mine(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Unauthorized();

        var rows = await db.FeedbackReports.AsNoTracking()
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new FeedbackDto(r.Id, r.Kind, r.Message, r.PageUrl, r.Screenshot != null,
                r.Status, r.Response, r.RespondedAt, r.CreatedAt))
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// <summary>Only while nobody has picked it up: once it is being handled, it stays.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Unauthorized();

        var report = await db.FeedbackReports.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId, ct);
        if (report is null) return NotFound(new { message = "Cette demande n'existe plus." });
        if (report.Status != FeedbackStatus.Sent)
            return Conflict(new { message = "Cette demande est déjà prise en charge et ne peut plus être supprimée." });

        db.FeedbackReports.Remove(report);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/capture")]
    public async Task<IActionResult> Screenshot(Guid id, CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Unauthorized();

        var image = await db.FeedbackReports.AsNoTracking()
            .Where(r => r.Id == id && r.UserId == userId && r.Screenshot != null)
            .Select(r => new { r.Screenshot, r.ScreenshotType })
            .FirstOrDefaultAsync(ct);
        return image is null ? NotFound() : File(image.Screenshot!, image.ScreenshotType ?? "image/png");
    }

    private static FeedbackDto ToDto(FeedbackReport r) =>
        new(r.Id, r.Kind, r.Message, r.PageUrl, r.Screenshot != null, r.Status, r.Response, r.RespondedAt, r.CreatedAt);

    /// <summary>
    /// A data URL from the browser ("data:image/png;base64,…"), checked for type and size before
    /// anything is decoded into memory past the limit.
    /// </summary>
    private static EmailAttachment? ReadScreenshot(string dataUrl)
    {
        var comma = dataUrl.IndexOf(',');
        if (!dataUrl.StartsWith("data:", StringComparison.Ordinal) || comma < 0) return null;

        var header = dataUrl[5..comma];
        if (!header.EndsWith(";base64", StringComparison.Ordinal)) return null;
        var contentType = header[..^7].ToLowerInvariant();
        if (!ScreenshotTypes.TryGetValue(contentType, out var extension)) return null;

        var encoded = dataUrl.AsSpan(comma + 1);
        if (encoded.Length / 4 * 3 > MaxScreenshotBytes + 3) return null;

        var bytes = new byte[encoded.Length / 4 * 3 + 3];
        if (!Convert.TryFromBase64Chars(encoded, bytes, out var written) || written == 0 || written > MaxScreenshotBytes)
            return null;

        return new EmailAttachment($"capture.{extension}", contentType, bytes[..written]);
    }

    private static string RoleLabel(UserRole role) => role switch
    {
        UserRole.TenantAdmin => "Administrateur",
        UserRole.TenantUser => "Employé",
        UserRole.SuperAdmin => "Super admin",
        _ => role.ToString(),
    };
}

public record SendFeedbackRequest(string? Kind, string? Message, string? PageUrl, string? Screenshot = null);

public record FeedbackDto(
    Guid Id, string Kind, string Message, string? PageUrl, bool HasScreenshot,
    FeedbackStatus Status, string? Response, DateTimeOffset? RespondedAt, DateTimeOffset CreatedAt);

/// <summary>The e-mail a super admin receives: who, from which space and page, then the message.</summary>
public static class FeedbackEmail
{
    public static string Build(
        string label,
        string senderName,
        string senderEmail,
        string role,
        Guid userId,
        string? tenantName,
        string? tenantKind,
        Guid? tenantId,
        bool impersonating,
        string? pageUrl,
        string userAgent,
        DateTimeOffset sentAt,
        string message)
    {
        static string E(string? value) => WebUtility.HtmlEncode(value ?? "");

        var mail = E(senderEmail);
        var rows = new List<(string, string)>
        {
            ("Type", E(label)),
            ("De", $"{E(senderName)} &lt;<a href=\"mailto:{mail}\">{mail}</a>&gt;"),
            ("Rôle", E(role) + (impersonating ? " (super admin connecté à sa place)" : "")),
            ("Utilisateur", E(userId.ToString())),
            ("Espace", tenantName is null ? "Aucun" : $"{E(tenantName)} · {E(tenantKind)}<br><span style=\"color:#6b7280\">{E(tenantId.ToString())}</span>"),
        };

        // The page is whatever the browser said it was on: shown as text, linked only when it is
        // a web address, so a crafted value cannot turn into a javascript: link in the mailbox.
        if (!string.IsNullOrWhiteSpace(pageUrl))
        {
            var page = pageUrl.Length > 500 ? pageUrl[..500] : pageUrl;
            var isWeb = Uri.TryCreate(page, UriKind.Absolute, out var uri) && (uri.Scheme == "https" || uri.Scheme == "http");
            rows.Add(("Page", isWeb ? $"<a href=\"{E(page)}\">{E(page)}</a>" : E(page)));
        }

        if (!string.IsNullOrWhiteSpace(userAgent))
            rows.Add(("Navigateur", E(userAgent.Length > 300 ? userAgent[..300] : userAgent)));

        rows.Add(("Envoyé le", E(sentAt.ToString("yyyy-MM-dd HH:mm"))));

        var table = string.Concat(rows.Select(row =>
            $"<tr><td style=\"padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap\">{row.Item1}</td>" +
            $"<td style=\"padding:6px 0;vertical-align:top\">{row.Item2}</td></tr>"));

        var text = E(message).Replace("\r\n", "\n").Replace("\n", "<br>");

        return $"""
            <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:640px">
              <p style="font-size:17px;font-weight:600;margin:0 0 12px">{E(label)} envoyé depuis Vexta</p>
              <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">{table}</table>
              <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;background:#f9fafb">{text}</div>
              <p style="color:#6b7280;font-size:13px">Pour répondre, écrivez directement à {mail}.</p>
            </div>
            """;
    }
}
