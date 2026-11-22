namespace Vexta.Api.Domain;

/// <summary>
/// A file kept by HR. The bytes live in R2 through <see cref="MediaAsset"/>; this row says what
/// the file is and who it concerns. A null <see cref="EmployeeId"/> means it belongs to the
/// whole company — a policy, a certification — rather than to one person.
/// </summary>
public class HrDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Title { get; set; }

    /// <summary>Free text — "Contrat", "Politique", "Certification". Not an enum: every trade names these differently.</summary>
    public string? Category { get; set; }

    public Guid? EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    /// <summary>
    /// The uploaded file. Required: a document row without its file is a broken promise, which
    /// is why deleting the asset cascades to this row rather than leaving it dangling.
    /// </summary>
    public Guid MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
