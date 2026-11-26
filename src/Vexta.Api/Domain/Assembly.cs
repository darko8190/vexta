namespace Vexta.Api.Domain;

/// <summary>
/// A set prepared in advance and installed as one: a panel, a valve kit, a standard bathroom
/// rough-in. Its items are the materials it is made of; its cost and price are their sums.
/// </summary>
public class Assembly
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>AS-0001, numbered within the company.</summary>
    public int Number { get; set; }

    public required string Name { get; set; }
    public string? Description { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<AssemblyItem> Items { get; set; } = [];
}

/// <summary>One material in an assembly: taken from the catalogue or typed by hand.</summary>
public class AssemblyItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AssemblyId { get; set; }
    public Assembly? Assembly { get; set; }

    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }

    public required string Description { get; set; }
    public string? Unit { get; set; }
    public decimal Quantity { get; set; } = 1;
    public decimal? PurchasePrice { get; set; }
    public decimal UnitPrice { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>
/// An assembly put on a job, so many of it. The unit cost and price are copied from the
/// assembly when it is picked and belong to the line afterwards: changing the assembly later
/// does not restate a job already priced.
/// </summary>
public class ProjectAssembly
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public Guid? AssemblyId { get; set; }
    public Assembly? Assembly { get; set; }

    public Guid? ProjectTaskId { get; set; }
    public ProjectTask? ProjectTask { get; set; }

    public required string Name { get; set; }
    public decimal Quantity { get; set; } = 1;
    public decimal UnitCost { get; set; }
    public decimal UnitPrice { get; set; }
    public DateOnly? InstalledOn { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
