using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Sends;

public record SendLogDto(Guid Id, string Kind, string To, string? Cc, string Subject, string? SentByName, DateTimeOffset SentAt);

/// <summary>Writes a line of send history. Added to the context; the caller saves.</summary>
public static class SendHistory
{
    public static void Add(
        VextaDbContext db, Guid tenantId, string entityType, Guid entityId, string kind,
        string to, string subject, IEnumerable<string>? cc = null, Guid? userId = null, string? userName = null)
    {
        var copies = cc?.Where(c => !string.IsNullOrWhiteSpace(c)).ToList();
        db.SendLogs.Add(new SendLog
        {
            TenantId = tenantId,
            EntityType = entityType,
            EntityId = entityId,
            Kind = kind,
            To = to.Length > 500 ? to[..500] : to,
            Cc = copies is { Count: > 0 } ? string.Join(", ", copies) : null,
            Subject = subject.Length > 300 ? subject[..300] : subject,
            SentByUserId = userId,
            SentByName = userName,
        });
    }

    /// <summary>The signed-in person's name, for the « par » of a send.</summary>
    public static async Task<string?> NameOfAsync(VextaDbContext db, Guid? userId, CancellationToken ct) =>
        userId is { } id
            ? await db.Users.AsNoTracking().Where(u => u.Id == id).Select(u => u.FirstName + " " + u.LastName).FirstOrDefaultAsync(ct)
            : null;
}

/// <summary>The send history of one record, newest first.</summary>
[ApiController]
[Route("api/envois")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
public class SendLogsController(VextaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<SendLogDto>>> List([FromQuery] string type, [FromQuery] Guid id, CancellationToken ct) =>
        Ok(await db.SendLogs.AsNoTracking()
            .Where(s => s.EntityType == type && s.EntityId == id)
            .OrderByDescending(s => s.SentAt)
            .Take(200)
            .Select(s => new SendLogDto(s.Id, s.Kind, s.To, s.Cc, s.Subject, s.SentByName, s.SentAt))
            .ToListAsync(ct));
}
