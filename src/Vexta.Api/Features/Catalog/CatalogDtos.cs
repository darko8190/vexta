namespace Vexta.Api.Features.Catalog;

public record ModuleDto(
    Guid Id,
    string Icon,
    string Title,
    string Description,
    int SortOrder,
    bool IsPublished,
    /// <summary>The route it opens in a tenant's sidebar. Null for a module with no screen.</summary>
    string? NavHref,
    Guid? ParentModuleId,
    bool OwnerOnly);

public record FeatureDto(
    Guid Id,
    /// <summary>What the application checks. Fixed for the two features Vexta ships with.</summary>
    string Key,
    string Name,
    string Description,
    string Icon,
    int SortOrder,
    bool IsPublished,
    /// <summary>Shipped with Vexta: its key cannot be changed and the row cannot be deleted.</summary>
    bool IsBuiltIn,
    int PlanCount);

public record SaveFeatureRequest(
    string Key,
    string Name,
    string Description,
    string Icon,
    int SortOrder,
    bool IsPublished);

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
    /// <summary>
    /// Receipts a month this plan may have read by a model. Zero turns the feature off, which
    /// is the honest way to keep it out of a cheap tier.
    /// </summary>
    int MonthlyReceiptScans,
    /// <summary>Days of free trial. Zero asks for the card at signup.</summary>
    int TrialDays,
    /// <summary>A percentage off the first months. Both zero means no discount.</summary>
    int DiscountPercent,
    int DiscountMonths,
    bool IsPublished,
    int SortOrder,
    /// <summary>Null when Stripe could not be reached: such a plan cannot be published.</summary>
    string? StripePriceId,
    IReadOnlyList<ModuleDto> Modules,
    /// <summary>What the plan lets a company do, as opposed to what it lets them open.</summary>
    IReadOnlyList<FeatureDto> Features,
    int TenantCount);

/// <summary>What the public site needs: no Stripe ids, no unpublished rows.</summary>
public record PublicModuleDto(Guid Id, string Icon, string Title, string Description);

public record PublicFeatureDto(string Key, string Icon, string Name, string Description);

public record PublicPlanDto(
    Guid Id,
    string Name,
    string? Description,
    long AmountCents,
    string Currency,
    int MinUsers,
    int MaxUsers,
    /// <summary>
    /// Days of free trial, so the card can say so. A trial nobody is told about is a trial
    /// nobody takes, and the pricing page is the one place the decision is made.
    /// </summary>
    int TrialDays,
    int DiscountPercent,
    int DiscountMonths,
    IReadOnlyList<PublicModuleDto> Modules,
    IReadOnlyList<PublicFeatureDto> Features);

public record SaveModuleRequest(
    string Icon,
    string Title,
    string Description,
    int SortOrder,
    bool IsPublished,
    string? NavHref = null,
    Guid? ParentModuleId = null,
    bool OwnerOnly = false);

public record SavePlanRequest(
    string Name,
    string? Description,
    long AmountCents,
    int MinUsers,
    int MaxUsers,
    int SortOrder,
    bool IsPublished,
    IReadOnlyList<Guid> ModuleIds,
    /// <summary>Defaults to 100 when a caller says nothing, like the column itself.</summary>
    int MonthlyReceiptScans = 100,
    /// <summary>Zero keeps the old behaviour: the card is asked for at signup.</summary>
    int TrialDays = 0,
    int DiscountPercent = 0,
    int DiscountMonths = 0,
    /// <summary>
    /// Optional so a caller written before features existed keeps working: null leaves the
    /// plan's features alone rather than silently emptying them.
    /// </summary>
    IReadOnlyList<Guid>? FeatureIds = null);

/// <summary>
/// The modules in the order they should appear, parents and children together.
///
/// Positions are taken from the order of the list rather than sent as numbers: a browser that
/// computes its own ranks is a browser that can disagree with the server about what "third"
/// means, and the only thing that actually matters is the sequence.
/// </summary>
public record ReorderModulesRequest(IReadOnlyList<Guid> Ids);
