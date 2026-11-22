using Vexta.Api.Domain;

namespace Vexta.Api.Features.Tenants;

public record TenantDto(
    Guid Id,
    string Name,
    string Slug,
    string Kind,
    string SubscriptionStatus,
    DateTimeOffset? CurrentPeriodEnd,
    DateTimeOffset CreatedAt,
    int UserCount,
    int ClientCount,
    /// <summary>Null for a personal space, and for a tenant created by hand before a plan was chosen.</summary>
    Guid? PlanId,
    string? PlanName,
    /// <summary>Seats the plan allows. 1 when there is no plan: the owner and nobody else.</summary>
    int MaxUsers);

public record CreateTenantRequest(
    string CompanyName,
    string AdminFirstName,
    string AdminLastName,
    string AdminEmail,
    string AdminPassword);

public record UpdateTenantSubscriptionRequest(TenantSubscriptionStatus Status);

/// <summary>Null detaches the plan, which drops the space back to a single seat.</summary>
public record UpdateTenantPlanRequest(Guid? PlanId);
