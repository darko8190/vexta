using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

public record InvoiceLineDto(
    Guid Id,
    InvoiceLineKind Kind,
    /// <summary>The catalogue entry this line came from, for a material or a piece of equipment.</summary>
    Guid? ProductId,
    string Description,
    decimal Quantity,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    /// <summary>The selling price per unit — what the client is charged.</summary>
    decimal UnitPrice,
    bool IsTaxable,
    int SortOrder);

public record InvoiceDto(
    Guid Id,
    string Number,
    Guid ClientId,
    string ClientName,
    Guid? ProjectId,
    /// <summary>The project's own number, so a reference reads P-0007 and never a GUID.</summary>
    int? ProjectNumber,
    InvoiceStatus Status,
    DateOnly IssueDate,
    DateOnly DueDate,
    string Currency,
    string? Notes,
    /// <summary>No tax on this invoice. No line is taxable while it is set.</summary>
    bool IsTaxExempt,
    /// <summary>Which margin the catalogue lines were priced with, if any.</summary>
    Guid? PricePolicyId,
    string? PricePolicyName,
    /// <summary>When it was emailed to the client, or null if it never was.</summary>
    DateTimeOffset? SentAt,
    decimal Subtotal,
    /// <summary>
    /// The two taxes, named and separated. One "taxes" figure is what a company gets asked to
    /// break down the moment it files a return, and splitting it after the fact means
    /// recomputing from rates that may have changed since.
    /// </summary>
    string Tax1Label,
    decimal Tax1,
    string Tax2Label,
    decimal Tax2,
    decimal TaxTotal,
    decimal Total,
    List<InvoiceLineDto> Lines,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    /// <summary>When the automatic reminder went out for the current sending, if it did.</summary>
    DateTimeOffset? ReminderSentAt = null);

/// <summary>
/// Description is nullable so that a line being typed can still be previewed. A non-nullable
/// string here is implicitly required by model binding, which answered the preview of a
/// half-filled invoice with a 400 — the one invoice the preview exists for. What may not be
/// saved blank is checked where it matters, when the invoice is created.
/// </summary>
public record InvoiceLineRequest(
    InvoiceLineKind Kind,
    Guid? ProductId,
    string? Description,
    decimal Quantity,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    decimal UnitPrice,
    bool IsTaxable);

/// <summary>
/// No currency here on purpose: it is the company's, read from its billing settings when the
/// invoice is created and then kept on the invoice. Asking per invoice made it a field nobody
/// changed and anybody could get wrong, and letting it be re-sent on an edit meant a settings
/// change could restate a document the client already holds.
/// </summary>
public record UpsertInvoiceRequest(
    Guid ClientId,
    Guid? ProjectId,
    InvoiceStatus Status,
    DateOnly IssueDate,
    DateOnly DueDate,
    string? Notes,
    /// <summary>
    /// Null means "take the answer from the project, or from the client when there is none",
    /// which is what a new invoice does.
    /// </summary>
    bool? IsTaxExempt,
    /// <summary>Null keeps whatever the invoice has, or takes the project's on a new one.</summary>
    Guid? PricePolicyId,
    List<InvoiceLineRequest> Lines);

/// <summary>What sending an invoice answers: where it went, and what it is now.</summary>
public record InvoiceSentDto(string Email, DateTimeOffset SentAt, InvoiceStatus Status);

/// <summary>
/// Somebody the invoice can be addressed to, or put in copy: the client's own file, one of its
/// contacts, or an employee of the company.
/// </summary>
/// <param name="Id">
/// The contact's or the employee's id, and null for the address on the client's own file — that
/// one belongs to no row of its own.
/// </param>
/// <param name="Role">Where this address sits: « Fiche du client », « Comptabilité ».</param>
public record InvoiceRecipientDto(Guid? Id, string Name, string Email, string? Role);

/// <summary>A file already on file that can ride along with the invoice.</summary>
public record InvoiceAttachmentOptionDto(Guid Id, string Title, string FileName, long SizeBytes);

/// <summary>
/// Everything the send form needs, in one request: who it can go to, the company's own wording
/// with this invoice's figures already filled in, and what can be attached.
///
/// The subject and the body arrive rendered rather than as templates. The person about to press
/// Send has to be reading the message that will actually leave, and a screen that fills the
/// fields its own way is a screen that will one day disagree with the inbox.
/// </summary>
public record InvoiceSendDefaultsDto(
    /// <summary>The address pre-selected, or null when there is not one address on file.</summary>
    string? To,
    string Subject,
    /// <summary>HTML, values already escaped by the renderer.</summary>
    string Body,
    List<InvoiceRecipientDto> Recipients,
    List<InvoiceRecipientDto> Employees,
    /// <summary>Empty when the invoice belongs to no project.</summary>
    List<InvoiceAttachmentOptionDto> ProjectDocuments);

/// <summary>
/// What the send form asks for.
///
/// The copy is given as employee ids, never as addresses. The subject and the body are the
/// person's own words and come through as typed; everything else is looked up again server-side.
/// </summary>
public record SendInvoiceRequest(
    string? To,
    List<Guid>? CcEmployeeIds,
    string? Subject,
    string? Body,
    /// <summary>Files uploaded in the send form itself, already in the library.</summary>
    List<Guid>? MediaAssetIds,
    /// <summary>Documents of this invoice's project, chosen by their document id.</summary>
    List<Guid>? ProjectDocumentIds);

/// <summary>
/// One line of a draft invoice. Shaped like <see cref="InvoiceLineRequest"/> rather than like
/// <see cref="InvoiceLineDto"/>: it has no id and no sort order because nothing has been saved
/// — this is what the form is filled in with, and the person still decides what is invoiced.
/// </summary>
public record InvoiceDraftLineDto(
    InvoiceLineKind Kind,
    Guid? ProductId,
    string Description,
    decimal Quantity,
    decimal? PurchasePrice,
    decimal? MarginPercent,
    decimal UnitPrice,
    bool IsTaxable);

/// <summary>
/// What an invoice for a project would start as, built from what the job actually consumed:
/// its materials, its hours and its billable expenses.
///
/// It writes nothing. A project that has been worked on is not a project someone has decided
/// to invoice, and creating the document on their behalf would put a number on the company's
/// books before anyone had looked at the lines.
/// </summary>
public record InvoiceDraftDto(
    Guid ClientId,
    /// <summary>The project's policy, or the company's default when it names none.</summary>
    Guid? PricePolicyId,
    bool IsTaxExempt,
    List<InvoiceDraftLineDto> Lines);
