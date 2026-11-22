// Named after the policies and not after the folder on purpose: a namespace called
// Features.Pricing shadows Common.Pricing inside every other Features.* file, which is where
// the margin formulas are called from.
namespace Vexta.Api.Features.PricePolicies;

/// <summary>
/// A policy as a list shows it. IsDefault is answered from the company's billing settings
/// rather than from the row's own flag: the two are kept in step, and when they could ever
/// disagree the settings are the ones a project or an invoice actually reads.
/// </summary>
public record PricePolicyDto(
    Guid Id,
    string Name,
    decimal MarginPercent,
    string? Description,
    bool IsDefault,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record SavePricePolicyRequest(
    string Name,
    decimal MarginPercent,
    string? Description,
    bool IsDefault);
