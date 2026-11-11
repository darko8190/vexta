using System.Security.Claims;
using Vexta.Api.Domain;

namespace Vexta.Api.Common;

public interface ICurrentUserService
{
    Guid? UserId { get; }
    Guid? TenantId { get; }
    UserRole? Role { get; }
    bool IsSuperAdmin { get; }
}

public class CurrentUserService(IHttpContextAccessor accessor) : ICurrentUserService
{
    private ClaimsPrincipal? User => accessor.HttpContext?.User;

    public Guid? UserId =>
        Guid.TryParse(User?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public Guid? TenantId =>
        Guid.TryParse(User?.FindFirstValue(VextaClaimTypes.TenantId), out var id) ? id : null;

    public UserRole? Role =>
        Enum.TryParse<UserRole>(User?.FindFirstValue(VextaClaimTypes.Role), out var role) ? role : null;

    public bool IsSuperAdmin => Role == UserRole.SuperAdmin;
}

public static class VextaClaimTypes
{
    public const string TenantId = "tenant_id";
    public const string Role = "role";
}
