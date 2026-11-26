namespace Vexta.Api.Domain;

/// <summary>
/// One employee's working day: when they started, when they finished, how long they stopped.
///
/// This is the « feuille de temps de jour » — the person's own day, the one payroll reads. It is
/// distinct from the poinçons (<see cref="TimesheetEntry"/>), the hours put on a project or a
/// task, which are what the client is billed for. A day can hold several poinçons, and time that
/// is on no job — the drive to the supplier, the shop in the morning — is still part of the day.
/// </summary>
public class WorkDay
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    /// <summary>The business day it belongs to, in Québec time.</summary>
    public DateOnly Date { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    /// <summary>Null while the day is under way.</summary>
    public DateTimeOffset? EndedAt { get; set; }

    /// <summary>Unpaid breaks taken during the day, in minutes.</summary>
    public int BreakMinutes { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
