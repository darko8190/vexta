namespace Vexta.Api.Domain;

public class Address
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ClientId { get; set; }
    public Client? Client { get; set; }

    public AddressType Type { get; set; } = AddressType.Facturation;
    public bool IsPrimary { get; set; }

    public required string Line1 { get; set; }
    public string? Line2 { get; set; }
    public required string City { get; set; }
    public string? Province { get; set; }
    public required string PostalCode { get; set; }
    public required string Country { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
