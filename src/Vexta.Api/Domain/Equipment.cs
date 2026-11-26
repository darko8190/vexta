namespace Vexta.Api.Domain;

public enum EquipmentStatus
{
    Disponible = 0,
    EnReparation = 1,
    HorsService = 2
}

/// <summary>What an equipment's rates are counted in.</summary>
public enum EquipmentUnit
{
    Heure = 0,
    Jour = 1,
    Semaine = 2,
    Unite = 3
}

/// <summary>
/// A machine or tool the company owns or rents and bills by the hour or the day: the scissor
/// lift, the excavator, the truck. Distinct from a product: a product is sold and leaves the
/// shelf; equipment comes back, and what the client pays for is its time.
/// </summary>
public class Equipment : ISoftDeletable
{
    // ---- Corbeille ----
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }

    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>Sequential within the company. Shown as EQ-0001.</summary>
    public int Number { get; set; }

    public required string Name { get; set; }
    public string? Description { get; set; }
    public string? SerialNumber { get; set; }

    public EquipmentUnit Unit { get; set; } = EquipmentUnit.Heure;

    /// <summary>What one unit of use costs the company, and what the client is billed for it.</summary>
    public decimal? CostRate { get; set; }
    public decimal? SellingRate { get; set; }

    public EquipmentStatus Status { get; set; } = EquipmentStatus.Disponible;

    /// <summary>Rented from someone else rather than owned.</summary>
    public bool IsRented { get; set; }

    public string? Notes { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Equipment used on a job: how much of it, when, at what rates. The rates are copied from the
/// equipment when the line is made, so a later change of price leaves past jobs as they were.
/// </summary>
public class ProjectEquipment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    /// <summary>SetNull: retiring a machine must not erase what it did on past jobs.</summary>
    public Guid? EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }

    /// <summary>Optional, as for the other lines of a job: the task it was used for.</summary>
    public Guid? ProjectTaskId { get; set; }
    public ProjectTask? ProjectTask { get; set; }

    /// <summary>The equipment's name when the line was made, kept if it is renamed or deleted.</summary>
    public required string Name { get; set; }
    public EquipmentUnit Unit { get; set; } = EquipmentUnit.Heure;
    public decimal Quantity { get; set; } = 1;
    public decimal? CostRate { get; set; }
    public decimal? SellingRate { get; set; }
    public DateOnly? UsedOn { get; set; }
    public string? Notes { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
