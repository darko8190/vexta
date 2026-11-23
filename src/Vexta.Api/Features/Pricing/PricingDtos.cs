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
    /// <summary>In ascending order of where they start, which is the order they are read in.</summary>
    List<PricePolicyTierDto> Tiers,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <summary>
/// One band: from this purchase price to that one, this margin. <see cref="ToAmount"/> is null
/// on the last band, meaning "and everything above".
/// </summary>
public record PricePolicyTierDto(
    decimal FromAmount,
    decimal? ToAmount,
    decimal MarginPercent);

/// <summary>
/// The bands arrive as a whole list rather than one at a time, and replace what was there.
/// A band only means anything next to its neighbours — a company moving a ceiling from 5 $ to
/// 10 $ is editing two bands at once, and saving them one by one would leave a gap or an
/// overlap on screen between the two requests.
/// </summary>
public record SavePricePolicyRequest(
    string Name,
    decimal MarginPercent,
    string? Description,
    bool IsDefault,
    List<PricePolicyTierDto>? Tiers);
