namespace Vexta.Api.Domain;

/// <summary>
/// A file filed against a job: the signed quote, a permit, a plan, a photograph of the finished
/// work, the client's own paperwork.
///
/// It is separate from an expense's photographs on purpose. A receipt proves what was spent and
/// belongs to that expense; this is the job's file, and it is what gets attached to an invoice
/// when the client asks for the plan along with the bill.
/// </summary>
public class ProjectDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    /// <summary>What it is, in the company's words. The file name alone is rarely readable.</summary>
    public required string Title { get; set; }

    /// <summary>The company's own filing: "Plan", "Permis", "Soumission". Free text, optional.</summary>
    public string? Category { get; set; }

    public Guid MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    public Guid? UploadedById { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Something written down about the job: what the client asked for on site, what was agreed on
/// the telephone, why the work stopped for two days.
///
/// Kept as a list of dated entries rather than one editable field, because that is what it is
/// used for — a thread the next person reads from the bottom — and because a single field is a
/// field that gets overwritten by whoever opens it last.
/// </summary>
public class ProjectNote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public required string Body { get; set; }

    public Guid? CreatedById { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
