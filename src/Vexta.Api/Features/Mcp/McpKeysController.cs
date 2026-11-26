using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Mcp;

public record McpKeyDto(
    Guid Id, string Name, string Prefix, bool CanWrite, string CreatedBy,
    DateTimeOffset CreatedAt, DateTimeOffset? LastUsedAt);

/// <summary>The key itself travels only here, in the answer to its creation.</summary>
public record CreatedMcpKeyDto(McpKeyDto Key, string Secret);

public record CreateMcpKeyRequest(string? Name, bool CanWrite);

/// <summary>
/// The company's MCP keys: made, listed, revoked. Kept to the people who manage the company,
/// because a key is a door into all of it.
/// </summary>
[ApiController]
[Route("api/cles-mcp")]
[Authorize(Roles = Roles.Managers)]
[StaffOnly]
[RequireBusinessTenant]
public class McpKeysController(VextaDbContext db, ICurrentUserService currentUser, IFeatureService features) : ControllerBase
{
    /// <summary>Whether the company's plan includes MCP keys, for the settings card.</summary>
    [HttpGet("disponibilite")]
    public async Task<ActionResult<object>> Availability(CancellationToken ct) =>
        Ok(new { included = await features.IsEnabledAsync(FeatureKeys.Mcp, ct) });

    public const string KeyStart = "vxk_";

    [HttpGet]
    public async Task<ActionResult<List<McpKeyDto>>> List(CancellationToken ct) =>
        Ok(await db.McpKeys.AsNoTracking()
            .Where(k => k.RevokedAt == null)
            .OrderByDescending(k => k.CreatedAt)
            .Select(k => new McpKeyDto(
                k.Id, k.Name, k.Prefix, k.CanWrite,
                db.Users.Where(u => u.Id == k.UserId).Select(u => u.FirstName + " " + u.LastName).FirstOrDefault() ?? "",
                k.CreatedAt, k.LastUsedAt))
            .ToListAsync(ct));

    [HttpPost]
    public async Task<ActionResult<CreatedMcpKeyDto>> Create(CreateMcpKeyRequest request, CancellationToken ct)
    {
        if (!await features.IsEnabledAsync(FeatureKeys.Mcp, ct))
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new { message = "Les clés MCP ne font pas partie de votre forfait." });
        }

        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name)) return BadRequest(new { message = "Donnez un nom à la clé, pour savoir à quoi elle sert." });
        if (name.Length > 100) return BadRequest(new { message = "Le nom est trop long." });
        if (currentUser.UserId is not { } userId || currentUser.TenantId is not { } tenantId) return Forbid();

        // 32 random bytes: the key is the whole credential, so it has to be unguessable.
        var secret = KeyStart + Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var key = new McpKey
        {
            TenantId = tenantId,
            UserId = userId,
            Name = name,
            Prefix = secret[..12],
            KeyHash = Hash(secret),
            CanWrite = request.CanWrite,
        };
        db.McpKeys.Add(key);
        await db.SaveChangesAsync(ct);

        var creator = await db.Users.Where(u => u.Id == userId).Select(u => u.FirstName + " " + u.LastName).FirstOrDefaultAsync(ct) ?? "";
        return Ok(new CreatedMcpKeyDto(
            new McpKeyDto(key.Id, key.Name, key.Prefix, key.CanWrite, creator, key.CreatedAt, null), secret));
    }

    /// <summary>Revoked rather than deleted: the row says when, and the hash can never come back.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Revoke(Guid id, CancellationToken ct)
    {
        var key = await db.McpKeys.FirstOrDefaultAsync(k => k.Id == id && k.RevokedAt == null, ct);
        if (key is null) return NotFound();
        key.RevokedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    public static string Hash(string secret) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(secret))).ToLowerInvariant();
}
