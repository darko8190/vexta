namespace Vexta.Api.Features.Projects;

// ---- Lecture d'un reçu ----

/// <param name="MediaAssetId">A photograph or PDF already attached to this expense.</param>
public record ReadReceiptRequest(Guid MediaAssetId);

/// <summary>
/// What a model read off a receipt, for the form to fill in.
///
/// Nothing here is saved. It is a suggestion the person looks at and accepts or corrects — a
/// receipt read wrong and filed silently ends up on a client's invoice.
/// </summary>
public record ReceiptReadingDto(
    bool Found,
    /// <summary>Why nothing came back, or null when the reading speaks for itself.</summary>
    string? Message,
    /// <summary>Scans left in the month's allowance.</summary>
    int Remaining,
    string? Supplier,
    decimal? Total,
    decimal? Gst,
    decimal? Qst,
    DateOnly? SpentOn,
    string? InvoiceNumber);

/// <summary>
/// Whether the button is worth offering: the platform has a key, and the company has scans
/// left. Asked before a photograph is attached, so the form knows what to show.
/// </summary>
public record ReceiptScanAvailabilityDto(bool Available, int Remaining, int Allowance);

/// <summary>One of the company's expense categories, as the dropdown lists it.</summary>
public record ExpenseTypeDto(Guid Id, string Name, int ExpenseCount);

public record SaveExpenseTypeRequest(string Name);

/// <summary>
/// A photograph of an expense, with a link that works right now. The URL is signed on the way
/// out and expires, which is why it is handed over when the expense is opened rather than kept
/// anywhere: a stored link is a link that has stopped working by the time anyone clicks it.
/// </summary>
public record ExpensePhotoDto(
    Guid Id,
    Guid MediaAssetId,
    string FileName,
    string ContentType,
    string? Url,
    int SortOrder);

/// <summary>
/// An expense as the project's list shows it. The photographs are counted here and fetched when
/// one is opened: signing a URL per receipt to draw a list of twenty is work nobody asked for.
/// </summary>
public record ProjectExpenseDto(
    Guid Id,
    Guid ProjectId,
    string Name,
    string? Description,
    Guid ExpenseTypeId,
    string ExpenseTypeName,
    decimal? Cost,
    decimal? SellingPrice,
    DateOnly? SpentOn,
    int PhotoCount,
    /// <summary>
    /// The task on this job it belongs to, and that task's title for the list. Both null for a
    /// line posted against the job as a whole, which is most of them.
    /// </summary>
    Guid? ProjectTaskId,
    string? ProjectTaskTitle,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <summary>The expense plus its photographs, for the panel that shows or edits one.</summary>
public record ProjectExpenseDetailDto(ProjectExpenseDto Expense, IReadOnlyList<ExpensePhotoDto> Photos);

/// <param name="MediaAssetIds">
/// The photographs, in the order they should appear. It is the whole set every time: what is
/// sent replaces what the expense had, so removing a receipt is saving the list without it.
/// </param>
public record SaveProjectExpenseRequest(
    string Name,
    string? Description,
    Guid ExpenseTypeId,
    decimal? Cost,
    decimal? SellingPrice,
    DateOnly? SpentOn,
    IReadOnlyList<Guid>? MediaAssetIds,
    /// <summary>Optional: the task this expense was incurred for.</summary>
    Guid? ProjectTaskId = null);
