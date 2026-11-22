using Microsoft.AspNetCore.Identity;

namespace Vexta.Api.Domain;

public class ApplicationUser : IdentityUser<Guid>
{
    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public UserRole Role { get; set; } = UserRole.TenantUser;

    /// <summary>
    /// The space they land in when they sign in. Which spaces they may switch to afterwards is
    /// <see cref="Memberships"/> — this is only the default, not the whole of their access.
    /// </summary>
    public Guid? TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public List<TenantMembership> Memberships { get; set; } = [];

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
