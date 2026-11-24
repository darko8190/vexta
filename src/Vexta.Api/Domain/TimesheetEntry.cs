namespace Vexta.Api.Domain;

/// <summary>
/// One stretch of time someone worked on a job.
///
/// Both ends carry a date, not just a clock time: a shift that starts at 22 h and ends at 2 h
/// is one entry, and a single date with two times cannot say that without the reader guessing.
/// </summary>
public class TimesheetEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    /// <summary>
    /// The task on this job that this line belongs to, or null for something posted against the
    /// job as a whole.
    ///
    /// Optional on purpose. Not every hour and not every bag of concrete belongs to a named
    /// task, and forcing a choice would get a made-up answer — which is worse than no answer,
    /// because a task's total would then be wrong rather than merely incomplete. What it buys
    /// when it is filled in is the figure nobody could produce before: what one task actually
    /// cost, what it sold for, and the difference.
    ///
    /// SetNull on delete: removing a task from the plan must not take the hours or the money
    /// spent while it existed.
    /// </summary>
    public Guid? ProjectTaskId { get; set; }
    public ProjectTask? ProjectTask { get; set; }

    /// <summary>
    /// Who worked. Required when the entry is filed and nullable here on purpose: taking
    /// someone off the payroll must not erase the hours that were billed for them.
    /// </summary>
    public Guid? EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    /// <summary>
    /// The hours billed, rounded to the quarter by <see cref="Common.WorkHours"/>. Stored
    /// rather than derived on read: it is what the invoice was built from, and changing how
    /// the rounding works must not silently restate hours already billed.
    /// </summary>
    public decimal Hours { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
