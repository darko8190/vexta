namespace Vexta.Api.Domain;

/// <summary>
/// A file in the shared R2 bucket. This row is the index; R2 holds the bytes. Objects are keyed
/// under the tenant's own prefix, so one tenant's files can never be listed through another's.
/// </summary>
public class MediaAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    /// <summary>The object key in the bucket: "{tenantId}/{id}{extension}".</summary>
    public required string ObjectKey { get; set; }

    /// <summary>The name the person uploaded, shown in the library and used for downloads.</summary>
    public required string FileName { get; set; }

    /// <summary>The type of the original file, which is what a reader should interpret it as.</summary>
    public required string ContentType { get; set; }

    /// <summary>
    /// "gzip" when the browser compressed the bytes before uploading, otherwise null. R2 holds
    /// the same value as the object's Content-Encoding, so browsers inflate it on their own and
    /// nothing in this application has to decompress anything.
    /// </summary>
    public string? ContentEncoding { get; set; }

    /// <summary>What R2 actually holds, which is what Cloudflare bills for.</summary>
    public long SizeBytes { get; set; }

    /// <summary>
    /// What the file weighed on the person's machine. Equal to <see cref="SizeBytes"/> when the
    /// file was stored as-is; larger when it compressed. Kept so the library can show what the
    /// compression saved.
    /// </summary>
    public long OriginalSizeBytes { get; set; }

    public Guid? UploadedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
