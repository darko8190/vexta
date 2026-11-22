namespace Vexta.Api.Domain;

/// <summary>
/// A named group of employees — "Toiture", "Administration". Membership is many-to-many on
/// purpose: a foreman belongs to his crew and to the management team at once.
/// </summary>
public class Team
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Name { get; set; }
    public string? Description { get; set; }

    /// <summary>
    /// Who answers for the team. Nullable and SetNull on delete: losing a lead must leave the
    /// team standing rather than take it down with them.
    /// </summary>
    public Guid? LeadEmployeeId { get; set; }
    public Employee? LeadEmployee { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Employee> Members { get; set; } = [];
}
