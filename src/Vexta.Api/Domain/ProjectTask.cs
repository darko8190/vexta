namespace Vexta.Api.Domain;

/// <summary>
/// Where a task stands. Bloquee is its own state rather than a note in the description: a job
/// waiting on a part is not late through anybody's fault, and a list that cannot say so turns
/// every delay into the same red.
/// </summary>
public enum ProjectTaskStatus
{
    AFaire = 0,
    EnCours = 1,
    Bloquee = 2,
    Terminee = 3
}

/// <summary>
/// Four levels, not five. Normale is the default and the middle, so raising or lowering a task
/// is one step in a direction and not a guess at a number.
/// </summary>
public enum ProjectTaskPriority
{
    Basse = 0,
    Normale = 1,
    Haute = 2,
    Urgente = 3
}

/// <summary>
/// One thing to do on a job: "poser les solives", "appeler l'inspecteur".
///
/// A task is handed either to named people or to a whole team, and both are kept rather than
/// one resolved into the other: "l'équipe Toiture" is an instruction that survives someone
/// leaving the crew, and three names is an instruction that does not change when the crew is
/// reshuffled. A task with neither is on the job but on nobody — which is a real state, and the
/// list says so instead of inventing an owner.
/// </summary>
public class ProjectTask
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public required string Title { get; set; }
    public string? Description { get; set; }

    public ProjectTaskStatus Status { get; set; } = ProjectTaskStatus.AFaire;
    public ProjectTaskPriority Priority { get; set; } = ProjectTaskPriority.Normale;

    public DateOnly? StartDate { get; set; }
    public DateOnly? DueDate { get; set; }

    /// <summary>
    /// What it was expected to take. Compared against the hours really logged on the project,
    /// which is the only way an estimate ever gets better.
    /// </summary>
    public decimal? EstimatedHours { get; set; }

    /// <summary>
    /// The crew it was handed to. SetNull on delete: disbanding a team must leave its tasks
    /// standing, unassigned, rather than delete work that is still to be done.
    /// </summary>
    public Guid? AssignedTeamId { get; set; }
    public Team? AssignedTeam { get; set; }

    /// <summary>The named people it was handed to. Empty when it went to a team, or to nobody.</summary>
    public List<Employee> Assignees { get; set; } = [];

    /// <summary>
    /// Filled when the status becomes Terminee and cleared when it is reopened, so the two can
    /// never disagree. Set by the API, never sent by the form.
    /// </summary>
    public DateTimeOffset? CompletedAt { get; set; }

    /// <summary>Who ticked it off. Kept as an id: the account may be gone by the time it is read.</summary>
    public Guid? CompletedByUserId { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>True once the due date is behind us and the work is still not done.</summary>
    public bool IsLate(DateOnly today) =>
        Status != ProjectTaskStatus.Terminee && DueDate is { } due && due < today;
}
