using Vexta.Api.Domain;
using Vexta.Api.Features.Projects;

namespace Vexta.Api.Features.Quotes;

public record QuoteDto(
    Guid Id,
    /// <summary>Sequential within the tenant. Shown as S-0001.</summary>
    int Number,
    Guid ClientId,
    string ClientName,
    string? PoNumber,
    string? Description,
    QuoteStatus Status,
    DateOnly? IssuedOn,
    DateOnly? ValidUntil,
    DateOnly? StartDate,
    DateOnly? EndDate,
    bool IsTaxExempt,
    Guid? ClientAssetId,
    string? ClientAssetLabel,
    ProjectAddressDto? ClientAddress,
    bool SameAddressAsClient,
    ProjectAddressDto? SiteAddress,
    Guid? CategoryId,
    string? CategoryName,
    Guid? SubCategoryId,
    string? SubCategoryName,
    Guid? WageClassificationId,
    string? WageClassificationName,
    /// <summary>The project it became, once accepted.</summary>
    Guid? ProjectId,
    int? ProjectNumber,
    /// <summary>Before taxes, so the list can show the price without a second request.</summary>
    decimal Subtotal,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    /// <summary>When it was last emailed to the client.</summary>
    DateTimeOffset? SentAt,
    /// <summary>The client's answer from the portal, if they gave one there.</summary>
    DateTimeOffset? ClientRespondedAt,
    string? ClientRespondedBy,
    string? ClientResponseNote,
    /// <summary>The name typed to sign the acceptance, when accepted from the portal.</summary>
    string? ClientSignature,
    /// <summary>Whether a drawn signature goes with it; the image itself is at /signature.</summary>
    bool HasDrawnSignature,
    /// <summary>The share asked up front, in percent, and the invoice drafted for it.</summary>
    decimal? DepositPercent,
    Guid? DepositInvoiceId,
    string? DepositInvoiceNumber,
    /// <summary>What the options not (yet) chosen would add, before taxes. Not in the subtotal.</summary>
    decimal OptionsTotal,
    /// <summary>
    /// The optional lines, with their price: the customer chooses among them when accepting and
    /// cannot read the lines themselves, which carry the company's costs.
    /// </summary>
    IReadOnlyList<QuoteOptionDto> Options,
    /// <summary>1 for the first version; « S-0012 rév. 2 » from the second on.</summary>
    int Revision,
    /// <summary>The version this one revises, and the revision that replaced this one.</summary>
    Guid? ReplacesId,
    Guid? ReplacedById,
    /// <summary>The invoice this quote was billed by directly, without a project.</summary>
    Guid? InvoiceId,
    string? InvoiceNumber,
    /// <summary>When the last automatic reminder went out, if one did.</summary>
    DateTimeOffset? ReminderSentAt,
    /// <summary>Automatic reminders since the last sending.</summary>
    int ReminderCount,
    Guid? ContactId = null,
    string? ContactName = null,
    Guid? BillingContactId = null,
    string? BillingContactName = null,
    /// <summary>The client asked for a change from the email link: when, and what.</summary>
    DateTimeOffset? ChangeRequestedAt = null,
    string? ChangeRequestNote = null);

public record QuoteOptionDto(Guid Id, string Description, decimal Total, bool IsSelected);

/// <summary>How many quotes this person can see in one status: the list's filter shows it.</summary>
public record QuoteStatusCountDto(QuoteStatus Status, int Count);

/// <summary>
/// What became of the quotes sent over a period. The rate is accepted over decided (accepted,
/// refused or expired), null while none has been decided: a quote still waiting is neither a
/// win nor a loss yet.
/// </summary>
public record QuoteStatsDto(
    int Days,
    int Sent,
    int Accepted,
    int Refused,
    int Expired,
    int Pending,
    decimal? AcceptanceRate,
    decimal SentAmount,
    decimal AcceptedAmount);

/// <summary>What the client may write with their answer. Optional either way.</summary>
/// <param name="Signature">
/// The customer's full name, typed to sign. Required to accept, ignored on a refusal.
/// </param>
/// <param name="OptionIds">The optional lines the customer takes along with the acceptance.</param>
/// <param name="SignatureImage">The drawn signature, as the pad's PNG data URL.</param>
public record QuoteResponseRequest(
    string? Note, string? Signature = null, IReadOnlyList<Guid>? OptionIds = null, string? SignatureImage = null);

/// <summary>A template as the list shows it: enough to choose one by.</summary>
public record QuoteTemplateDto(
    Guid Id,
    string Name,
    string? Description,
    int LineCount,
    /// <summary>The lines that are not options, before taxes.</summary>
    decimal Subtotal,
    decimal? DepositPercent,
    DateTimeOffset UpdatedAt);

public record SaveQuoteTemplateRequest(string Name);

public record UpsertQuoteRequest(
    Guid ClientId,
    string? PoNumber,
    string? Description,
    QuoteStatus Status,
    DateOnly? IssuedOn,
    DateOnly? ValidUntil,
    DateOnly? StartDate,
    DateOnly? EndDate,
    /// <summary>Null means "take the client's answer", which is what a new quote does.</summary>
    bool? IsTaxExempt,
    Guid? ClientAddressId,
    bool SameAddressAsClient,
    Guid? SiteAddressId,
    Guid? ClientAssetId = null,
    Guid? CategoryId = null,
    Guid? SubCategoryId = null,
    Guid? WageClassificationId = null,
    /// <summary>Percent asked up front, from 0 to 100. Null or 0 for none.</summary>
    decimal? DepositPercent = null,
    /// <summary>On creation only: the template whose lines the new quote starts with.</summary>
    Guid? TemplateId = null,
    Guid? ContactId = null,
    Guid? BillingContactId = null);

public record QuoteLineDto(
    Guid Id,
    QuoteLineKind Kind,
    Guid? ProductId,
    string? Code,
    string Description,
    string? Unit,
    decimal Quantity,
    decimal? UnitCost,
    decimal UnitPrice,
    /// <summary>Quantity × price, rounded here so the screen and the total agree to the cent.</summary>
    decimal Total,
    int SortOrder,
    /// <summary>An extra the client may take; in the total only once <c>IsSelected</c>.</summary>
    bool IsOptional,
    bool IsSelected,
    Guid? EquipmentId = null,
    Guid? AssemblyId = null,
    /// <summary>The assembly line this material belongs to; such a line is not in the total.</summary>
    Guid? ParentLineId = null);

public record SaveQuoteLineRequest(
    QuoteLineKind Kind,
    string Description,
    decimal Quantity,
    decimal? UnitCost,
    decimal UnitPrice,
    Guid? ProductId = null,
    string? Code = null,
    string? Unit = null,
    bool IsOptional = false,
    /// <summary>The office marking an option as taken (the client said so by phone).</summary>
    bool IsSelected = false,
    Guid? EquipmentId = null,
    Guid? AssemblyId = null);

/// <summary>The rows behind each section, and the money, in the project's cost-table shape.</summary>
/// <param name="LinesWithoutCost">Lines in the price with no cost entered: the margin counts them as free.</param>
public record QuoteSummaryDto(
    int Tasks, int Materials, int ExtraCharges, int DocumentsAndNotes, ProjectCostTableDto Costs, int LinesWithoutCost,
    int Equipment = 0, int Assemblies = 0);

public enum QuoteLineChange
{
    Inchangee = 0,
    Ajoutee = 1,
    Retiree = 2,
    Modifiee = 3
}

/// <summary>One line as it stood in one version.</summary>
public record QuoteLineSnapshotDto(
    decimal Quantity, string? Unit, decimal UnitPrice, decimal Total, bool IsOptional, bool IsSelected);

/// <summary>A line of the comparison: null <c>Before</c> for an added line, null <c>After</c> for a removed one.</summary>
public record QuoteLineChangeDto(
    QuoteLineKind Kind, string Description, QuoteLineChange Change, QuoteLineSnapshotDto? Before, QuoteLineSnapshotDto? After);

/// <summary>A revision set against the version it replaces. Totals are before taxes.</summary>
public record QuoteComparisonDto(
    Guid PreviousId, string PreviousLabel, decimal PreviousSubtotal, decimal Subtotal, IReadOnlyList<QuoteLineChangeDto> Lines);
