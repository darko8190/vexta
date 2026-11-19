using Vexta.Api.Domain;

namespace Vexta.Api.Features.Auth;

public record LoginRequest(string Email, string Password);

public record RegisterTenantRequest(
    string CompanyName,
    string FirstName,
    string LastName,
    string Email,
    string Password);

public record AuthResponse(string AccessToken, UserDto User);

public record UserDto(
    Guid Id,
    string Email,
    string FirstName,
    string LastName,
    string Role,
    Guid? TenantId,
    string? TenantName,
    string? TenantSubscriptionStatus,
    bool IsImpersonating = false)
{
    public static UserDto ForUser(ApplicationUser user) => new(
        user.Id,
        user.Email ?? string.Empty,
        user.FirstName,
        user.LastName,
        user.Role.ToString(),
        user.TenantId,
        user.Tenant?.Name,
        user.Tenant?.SubscriptionStatus.ToString());

    // The super admin keeps their own identity and role; only the tenant context is swapped.
    public static UserDto ForImpersonation(ApplicationUser user, Tenant tenant) => new(
        user.Id,
        user.Email ?? string.Empty,
        user.FirstName,
        user.LastName,
        user.Role.ToString(),
        tenant.Id,
        tenant.Name,
        tenant.SubscriptionStatus.ToString(),
        IsImpersonating: true);
}

public record RegisterTenantResponse(string CheckoutUrl);
