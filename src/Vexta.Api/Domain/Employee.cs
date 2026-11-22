namespace Vexta.Api.Domain;

/// <summary>
/// Someone who works for the tenant. The record exists whether or not they can sign in: a
/// journalier on the payroll is on file here without ever consuming a seat. Access is granted
/// separately, by linking <see cref="UserId"/>, and that link is what the plan's seat limit counts.
/// </summary>
public class Employee
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }

    /// <summary>
    /// Unique within the tenant. Becomes the sign-in name the moment access is granted, which is
    /// why it is required even for an employee who will never log in — granting access later
    /// must not have to go back and ask for it.
    /// </summary>
    public required string Email { get; set; }

    public string? JobTitle { get; set; }
    public string? Phone { get; set; }

    /// <summary>
    /// The sign-in account, or null when the employee is only on file. Revoking access deletes
    /// the account and clears this, which frees the seat; the employee record stays untouched.
    /// </summary>
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }

    /// <summary>
    /// SHA-256 of the invitation token, never the token itself: a leaked database must not hand
    /// out working sign-up links. The raw token is shown once, when it is issued.
    /// </summary>
    public string? InvitationTokenHash { get; set; }
    public DateTimeOffset? InvitationExpiresAt { get; set; }

    /// <summary>When the invitation email actually left. Null when Mailgun is not configured.</summary>
    public DateTimeOffset? InvitationSentAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Team> Teams { get; set; } = [];

    public string FullName => $"{FirstName} {LastName}".Trim();

    /// <summary>
    /// True while the invitation is still usable. An expired one is not an error: the admin
    /// resends it, which issues a fresh token and invalidates the old one.
    /// </summary>
    public bool HasPendingInvitation(DateTimeOffset now) =>
        InvitationTokenHash is not null && InvitationExpiresAt > now;
}
