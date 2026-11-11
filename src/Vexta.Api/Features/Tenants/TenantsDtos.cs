using Vexta.Api.Domain;

namespace Vexta.Api.Features.Tenants;

public record TenantDto(
    Guid Id,
    string Name,
    string Slug,
    string SubscriptionStatus,
    DateTimeOffset? CurrentPeriodEnd,
    DateTimeOffset CreatedAt,
    int UserCount,
    int ClientCount);

public record CreateTenantRequest(
    string CompanyName,
    string AdminFirstName,
    string AdminLastName,
    string AdminEmail,
    string AdminPassword);

public record UpdateTenantSubscriptionRequest(TenantSubscriptionStatus Status);
