using System.Security.Claims;
using Vexta.Api.Domain;

namespace Vexta.Api.Common;

public interface ICurrentUserService
{
    Guid? UserId { get; }
    Guid? TenantId { get; }

    /// <summary>The client record a signed-in customer is confined to. Null for staff.</summary>
    Guid? ClientId { get; }

    UserRole? Role { get; }
    bool IsSuperAdmin { get; }
    bool IsImpersonating { get; }

    /// <summary>A customer of the tenant rather than someone who works there.</summary>
    bool IsClient { get; }
}

public class CurrentUserService(IHttpContextAccessor accessor) : ICurrentUserService
{
    private ClaimsPrincipal? User => accessor.HttpContext?.User;

    public Guid? UserId =>
        Guid.TryParse(User?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public Guid? TenantId =>
        Guid.TryParse(User?.FindFirstValue(VextaClaimTypes.TenantId), out var id) ? id : null;

    public Guid? ClientId =>
        Guid.TryParse(User?.FindFirstValue(VextaClaimTypes.ClientId), out var id) ? id : null;

    // ClaimTypes.Role, not VextaClaimTypes.Role: the bearer handler maps the short "role" claim
    // onto the standard one on the way in, so the short name never survives to here.
    public UserRole? Role =>
        Enum.TryParse<UserRole>(User?.FindFirstValue(ClaimTypes.Role), out var role) ? role : null;

    public bool IsSuperAdmin => Role == UserRole.SuperAdmin;

    public bool IsClient => Role == UserRole.Client;

    public bool IsImpersonating => User?.FindFirstValue(VextaClaimTypes.Impersonating) == "true";
}

public static class VextaClaimTypes
{
    public const string TenantId = "tenant_id";
    public const string ClientId = "client_id";
    public const string Role = "role";
    public const string Impersonating = "impersonating";
}
