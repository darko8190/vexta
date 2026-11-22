namespace Vexta.Api.Domain;

/// <summary>
/// A place the company occupies: head office, a yard, a warehouse. Distinct from a client's
/// address, which belongs to the client. The one flagged primary is what the company profile
/// shows and what appears on documents.
/// </summary>
public class CompanyLocation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>What people call it — "Siège social", "Entrepôt Est".</summary>
    public required string Label { get; set; }

    public bool IsPrimary { get; set; }

    public required string Line1 { get; set; }
    public string? Line2 { get; set; }
    public required string City { get; set; }
    public string? Province { get; set; }
    public required string PostalCode { get; set; }
    public required string Country { get; set; }

    public string? Phone { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
