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
    string? TenantSubscriptionStatus);

public record RegisterTenantResponse(string CheckoutUrl);
