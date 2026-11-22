namespace Vexta.Api.Domain;

/// <summary>
/// Someone on file who may be given a way to sign in. Employees, clients and the contacts inside
/// a client company are all on file first and may or may not get an account afterwards, and the
/// invitation works the same way for all three — one token, hashed, single use.
///
/// It is an interface rather than a shared table because the three records exist for their own
/// reasons: an employee is on the payroll, a client is who you invoice. Access is something that
/// happens to them, not what they are.
/// </summary>
public interface IInvitable
{
    Guid Id { get; }
    Guid TenantId { get; }
    string? FirstName { get; }
    string? LastName { get; }
    string? Email { get; }

    /// <summary>The sign-in account, or null when they are only on file.</summary>
    Guid? UserId { get; set; }

    /// <summary>SHA-256 of the invitation token. The token itself is shown once and never stored.</summary>
    string? InvitationTokenHash { get; set; }
    DateTimeOffset? InvitationExpiresAt { get; set; }

    /// <summary>When the invitation email left. Null when Mailgun is not configured.</summary>
    DateTimeOffset? InvitationSentAt { get; set; }

    DateTimeOffset UpdatedAt { get; set; }
}
