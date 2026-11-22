using Vexta.Api.Auth;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Auth;

public record LoginRequest(string Email, string Password);

public record RegisterTenantRequest(
    string CompanyName,
    string FirstName,
    string LastName,
    string Email,
    string Password,
    TenantKind Kind = TenantKind.Business,
    /// <summary>Required for a business space: which published plan they picked.</summary>
    Guid? PlanId = null);

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
    bool IsImpersonating = false,
    string? TenantKind = null,
    /// <summary>
    /// The company's chosen colour, so the application is painted in it from the first frame.
    /// It travels with the session rather than being fetched afterwards: a request of its own
    /// would mean every screen opens in Vexta's blue and then changes colour under the person.
    /// </summary>
    string? TenantBrandColor = null)
{
    public static UserDto ForUser(ApplicationUser user) => new(
        user.Id,
        user.Email ?? string.Empty,
        user.FirstName,
        user.LastName,
        user.Role.ToString(),
        user.TenantId,
        user.Tenant?.Name,
        user.Tenant?.SubscriptionStatus.ToString(),
        TenantKind: user.Tenant?.Kind.ToString(),
        TenantBrandColor: user.Tenant?.BrandColor);

    /// <summary>
    /// The same person seen from another of their spaces. The role comes from the membership,
    /// because it is not a property of the account: owner of their own space, employee of the
    /// company they work for.
    /// </summary>
    public static UserDto ForWorkspace(ApplicationUser user, Tenant tenant, UserRole role) => new(
        user.Id,
        user.Email ?? string.Empty,
        user.FirstName,
        user.LastName,
        role.ToString(),
        tenant.Id,
        tenant.Name,
        tenant.SubscriptionStatus.ToString(),
        TenantKind: tenant.Kind.ToString(),
        TenantBrandColor: tenant.BrandColor);

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
        IsImpersonating: true,
        TenantKind: tenant.Kind.ToString(),
        TenantBrandColor: tenant.BrandColor);
}

/// <summary>
/// A business sign-up returns a CheckoutUrl to send the browser to Stripe. A personal one is
/// free, so it returns a Session and the person lands straight in their space.
/// </summary>
public record RegisterTenantResponse(string? CheckoutUrl = null, AuthResponse? Session = null)
{
    /// <summary>Shared by the email form and the provider flow so both answer the same shape.</summary>
    public static RegisterTenantResponse For(TenantSignupResult result, ITokenService tokenService) =>
        result.CheckoutUrl is { } checkoutUrl
            ? new RegisterTenantResponse(CheckoutUrl: checkoutUrl)
            : new RegisterTenantResponse(
                Session: new AuthResponse(
                    tokenService.CreateAccessToken(result.User!),
                    UserDto.ForUser(result.User!)));
}

public record ExternalExchangeRequest(string Code);

/// <summary>A blank CompanyName means a personal sign-up: the space takes the person's name.</summary>
public record ExternalRegisterTenantRequest(string Ticket, string? CompanyName, Guid? PlanId);

/// <summary>What the callback parks in the ticket while it asks for a company name.</summary>
public record PendingExternalSignup(
    string Email,
    string FirstName,
    string LastName,
    string Provider,
    string ProviderKey,
    string? ProviderDisplayName);

/// <summary>The part of a pending sign-up the browser is allowed to see — no provider key.</summary>
public record PendingExternalSignupDto(
    string Email,
    string FirstName,
    string LastName,
    string Provider);
