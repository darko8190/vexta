namespace Vexta.Api.Domain;

/// <summary>
/// The company's own logo, stored as bytes rather than through R2.
///
/// Same reasoning as the platform's branding: a logo must survive a storage outage and a lost
/// key ring, and these files are small enough that a row is cheaper than an object plus a
/// signed URL on every page that shows it.
/// </summary>
public class TenantLogo
{
    /// <summary>The tenant owns exactly one, so its id is the key.</summary>
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public required string ContentType { get; set; }
    public required byte[] Content { get; set; }

    public int Width { get; set; }
    public int Height { get; set; }

    /// <summary>First 32 hex of the SHA-256, used as the cache buster in the image URL.</summary>
    public required string ETag { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
