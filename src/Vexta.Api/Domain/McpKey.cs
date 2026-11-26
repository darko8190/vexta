namespace Vexta.Api.Domain;

/// <summary>
/// A key a company hands to an outside system so it can work in Vexta through MCP.
///
/// The key acts as the person who made it, in this company, with that person's role: it can
/// do nothing they could not do on screen. Only its hash is kept — the key itself is shown once,
/// when it is made, and a lost key is replaced rather than recovered.
/// </summary>
public class McpKey
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>Whose rights the key carries.</summary>
    public Guid UserId { get; set; }

    /// <summary>What it is for, as the company names it: « Zapier », « Comptabilité ».</summary>
    public required string Name { get; set; }

    /// <summary>The first characters, shown in the list so a key can be recognised.</summary>
    public required string Prefix { get; set; }

    /// <summary>SHA-256 of the key, hex.</summary>
    public required string KeyHash { get; set; }

    /// <summary>False keeps the key to reading. Writes are opt-in, as for the assistant.</summary>
    public bool CanWrite { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}
