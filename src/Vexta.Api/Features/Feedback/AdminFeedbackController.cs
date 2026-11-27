using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Feedback;

/// <summary>
/// Every bug report and suggestion from every space, for the super admin to move from
/// « Envoyée » to « En traitement » to « Corrigée / Répondue », and to answer. The sender reads
/// the state and the answer in their own list.
/// </summary>
[ApiController]
[Route("api/admin/signalements")]
[Authorize(Roles = Roles.Platform)]
public class AdminFeedbackController(VextaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AdminFeedbackDto>>> List(CancellationToken ct)
    {
        var rows = await db.FeedbackReports.AsNoTracking()
            .OrderBy(r => r.Status == FeedbackStatus.Resolved)
            .ThenByDescending(r => r.CreatedAt)
            .Select(r => new AdminFeedbackDto(
                r.Id, r.Kind, r.Message, r.PageUrl, r.Screenshot != null, r.Status, r.Response,
                r.RespondedAt, r.CreatedAt, r.SenderName, r.SenderEmail, r.TenantName))
            .ToListAsync(ct);
        return Ok(rows);
    }

    [HttpPatch("{id:guid}/etat")]
    public async Task<IActionResult> SetStatus(Guid id, SetFeedbackStatusRequest request, CancellationToken ct)
    {
        if (!Enum.IsDefined(request.Status)) return BadRequest(new { message = "État inconnu." });

        var report = await db.FeedbackReports.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (report is null) return NotFound(new { message = "Cette demande n'existe plus." });

        report.Status = request.Status;
        report.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>The answer the sender reads, with the state it leaves the request in.</summary>
    [HttpPut("{id:guid}/reponse")]
    public async Task<IActionResult> Respond(Guid id, RespondFeedbackRequest request, CancellationToken ct)
    {
        if (!Enum.IsDefined(request.Status)) return BadRequest(new { message = "État inconnu." });
        var response = request.Response?.Trim();
        if (response is { Length: > FeedbackController.MaxMessageLength })
            return BadRequest(new { message = $"La réponse dépasse {FeedbackController.MaxMessageLength} caractères." });

        var report = await db.FeedbackReports.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (report is null) return NotFound(new { message = "Cette demande n'existe plus." });

        var now = DateTimeOffset.UtcNow;
        report.Response = string.IsNullOrEmpty(response) ? null : response;
        report.RespondedAt = report.Response is null ? null : now;
        report.Status = request.Status;
        report.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/capture")]
    public async Task<IActionResult> Screenshot(Guid id, CancellationToken ct)
    {
        var image = await db.FeedbackReports.AsNoTracking()
            .Where(r => r.Id == id && r.Screenshot != null)
            .Select(r => new { r.Screenshot, r.ScreenshotType })
            .FirstOrDefaultAsync(ct);
        return image is null ? NotFound() : File(image.Screenshot!, image.ScreenshotType ?? "image/png");
    }
}

public record AdminFeedbackDto(
    Guid Id, string Kind, string Message, string? PageUrl, bool HasScreenshot, FeedbackStatus Status,
    string? Response, DateTimeOffset? RespondedAt, DateTimeOffset CreatedAt,
    string SenderName, string SenderEmail, string? TenantName);

public record SetFeedbackStatusRequest(FeedbackStatus Status);

public record RespondFeedbackRequest(FeedbackStatus Status, string? Response);
