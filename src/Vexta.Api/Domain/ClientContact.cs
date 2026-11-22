namespace Vexta.Api.Domain;

/// <summary>
/// Someone else to reach at this client — accounts payable, a site foreman. The client's own
/// name fields stay the main contact; these are the additional ones.
/// </summary>
public class ClientContact : IInvitable
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ClientId { get; set; }
    public Client? Client { get; set; }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }

    /// <summary>Their job there — "Comptabilité", "Contremaître". Free text on purpose.</summary>
    public string? Role { get; set; }

    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Notes { get; set; }

    /// <summary>The sign-in account of this contact, or null when they are only on file.</summary>
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }

    public string? InvitationTokenHash { get; set; }
    public DateTimeOffset? InvitationExpiresAt { get; set; }
    public DateTimeOffset? InvitationSentAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public string FullName => $"{FirstName} {LastName}".Trim();
}
