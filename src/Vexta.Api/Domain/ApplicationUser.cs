using Microsoft.AspNetCore.Identity;

namespace Vexta.Api.Domain;

public class ApplicationUser : IdentityUser<Guid>
{
    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public UserRole Role { get; set; } = UserRole.TenantUser;

    public Guid? TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
