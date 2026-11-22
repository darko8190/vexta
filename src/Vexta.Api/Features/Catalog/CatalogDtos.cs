namespace Vexta.Api.Features.Catalog;

public record ModuleDto(Guid Id, string Icon, string Title, string Description, int SortOrder, bool IsPublished);

public record PlanDto(
    Guid Id,
    string Name,
    string? Description,
    long AmountCents,
    string Currency,
    /// <summary>The range's floor: shown to buyers, never enforced.</summary>
    int MinUsers,
    /// <summary>Seats the plan allows, the owner included. This one is enforced.</summary>
    int MaxUsers,
    bool IsPublished,
    int SortOrder,
    /// <summary>Null when Stripe could not be reached: such a plan cannot be published.</summary>
    string? StripePriceId,
    IReadOnlyList<ModuleDto> Modules,
    int TenantCount);

/// <summary>What the public site needs: no Stripe ids, no unpublished rows.</summary>
public record PublicModuleDto(Guid Id, string Icon, string Title, string Description);

public record PublicPlanDto(
    Guid Id,
    string Name,
    string? Description,
    long AmountCents,
    string Currency,
    int MinUsers,
    int MaxUsers,
    IReadOnlyList<PublicModuleDto> Modules);

public record SaveModuleRequest(string Icon, string Title, string Description, int SortOrder, bool IsPublished);

public record SavePlanRequest(
    string Name,
    string? Description,
    long AmountCents,
    int MinUsers,
    int MaxUsers,
    int SortOrder,
    bool IsPublished,
    IReadOnlyList<Guid> ModuleIds);
