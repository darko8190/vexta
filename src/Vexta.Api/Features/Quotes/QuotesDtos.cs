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
    string? ClientResponseNote);

/// <summary>What the client may write with their answer. Optional either way.</summary>
public record QuoteResponseRequest(string? Note);

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
    Guid? WageClassificationId = null);

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
    int SortOrder);

public record SaveQuoteLineRequest(
    QuoteLineKind Kind,
    string Description,
    decimal Quantity,
    decimal? UnitCost,
    decimal UnitPrice,
    Guid? ProductId = null,
    string? Code = null,
    string? Unit = null);

/// <summary>The rows behind each section, and the money, in the project's cost-table shape.</summary>
public record QuoteSummaryDto(int Tasks, int Materials, int ExtraCharges, int DocumentsAndNotes, ProjectCostTableDto Costs);
