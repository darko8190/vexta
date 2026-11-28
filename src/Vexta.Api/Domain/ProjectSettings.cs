namespace Vexta.Api.Domain;

/// <summary>
/// How the crew records its hours on a job. Manuel: the employee types the start, the end and
/// the rest, as on a paper sheet. Punch: Commencer, Pause, Continuer and Terminer, and the
/// clock does the arithmetic.
/// </summary>
public enum LabourEntryMode
{
    Manuel = 0,
    Punch = 1
}

/// <summary>Where a punched entry stands. Aucun is a closed entry, which is every manual one.</summary>
public enum PunchState
{
    Aucun = 0,
    EnCours = 1,
    EnPause = 2
}

/// <summary>A kind of task the company does — « Inspection », « Installation » — from Paramètres › Projets.</summary>
public class TaskType
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public required string Name { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// How pressing a project is. A list the company keeps: it starts as Basse, Moyenne and Haute
/// and grows from Paramètres › Projets.
/// </summary>
public class ProjectPriority
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public required string Name { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>What sets an automatic line off.</summary>
public enum AutoLineEvent
{
    ProjetCree = 0,
    TacheCreee = 1
}

/// <summary>The section of the project the automatic line lands in.</summary>
public enum AutoLineSection
{
    MainDoeuvre = 0,
    Materiaux = 1,
    Equipements = 2,
    FraisSupplementaires = 3
}

/// <summary>
/// A line added on its own to a project when something happens to it: a travel fee on every new
/// project, an hour of labour on every inspection task.
/// </summary>
public class ProjectAutoLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public AutoLineEvent Event { get; set; }

    /// <summary>For a task event: the type that sets it off. Null means any task.</summary>
    public Guid? TaskTypeId { get; set; }
    public TaskType? TaskType { get; set; }

    public AutoLineSection Section { get; set; }

    public required string Description { get; set; }

    /// <summary>Hours for labour, a quantity for everything else.</summary>
    public decimal Quantity { get; set; } = 1;
    public decimal? UnitCost { get; set; }

    /// <summary>For labour, the hourly rate; 0 takes the company's.</summary>
    public decimal UnitPrice { get; set; }

    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
