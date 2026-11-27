namespace Vexta.Api.Domain;

public enum FeedbackStatus
{
    /// <summary>Envoyée: nobody at Vexta has picked it up yet. The sender can still delete it.</summary>
    Sent = 0,
    /// <summary>En traitement.</summary>
    InProgress = 1,
    /// <summary>Corrigée (a bug) or Répondue (a suggestion).</summary>
    Resolved = 2,
}

/// <summary>
/// A bug report or a suggestion sent from the bug button. The super admins still get it by
/// e-mail; the row is what lets the sender follow it and the super admin move it along.
///
/// The sender is kept as a bare id plus a copy of their name and address, with no foreign key:
/// a report must never stop a user from being deleted, and the super admin still needs to know
/// who wrote it afterwards.
/// </summary>
public class FeedbackReport
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The space it was sent from; removed with that space.</summary>
    public Guid? TenantId { get; set; }
    public string? TenantName { get; set; }

    public Guid UserId { get; set; }
    public required string SenderName { get; set; }
    public required string SenderEmail { get; set; }

    /// <summary>« bug » or « suggestion ».</summary>
    public required string Kind { get; set; }
    public required string Message { get; set; }
    public string? PageUrl { get; set; }

    public byte[]? Screenshot { get; set; }
    public string? ScreenshotType { get; set; }

    public FeedbackStatus Status { get; set; } = FeedbackStatus.Sent;

    /// <summary>What Vexta answered, shown to the sender in their list.</summary>
    public string? Response { get; set; }
    public DateTimeOffset? RespondedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
