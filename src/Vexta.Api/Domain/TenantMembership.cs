namespace Vexta.Api.Domain;

/// <summary>
/// One person's place in one space. A person has several: their own free personal space, and
/// every company that gave them an account — so signing in is no longer the same thing as
/// choosing which space you are in. That choice is what the mode switch makes.
///
/// Deliberately not filtered by tenant: it is read before a tenant is chosen, which is the one
/// moment in the application where the current tenant is not yet known.
/// </summary>
public class TenantMembership
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public ApplicationUser? User { get; set; }

    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    /// <summary>
    /// What they are in that space. The same person is an owner of their personal space and an
    /// employee of the company they work for, so the role cannot live on the account.
    /// </summary>
    public UserRole Role { get; set; } = UserRole.TenantUser;

    /// <summary>
    /// For a <see cref="UserRole.Client"/> membership, the client record it is confined to —
    /// what they are allowed to see of the company. Null for everyone who works there.
    /// </summary>
    public Guid? ClientId { get; set; }
    public Client? Client { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
