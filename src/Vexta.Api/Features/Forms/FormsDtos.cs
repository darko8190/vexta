using Vexta.Api.Domain;

namespace Vexta.Api.Features.Forms;

// ---- The form itself ----

/// <summary>A form as the list shows it: enough to pick one, not enough to fill it.</summary>
public record FormTemplateDto(
    Guid Id,
    string Title,
    string? Description,
    string? SuccessMessage,
    FormKind Kind,
    bool IsPublished,
    /// <summary>Ticked for the company's page at /e/{slug}. Shown there only once published too.</summary>
    bool ShowOnPublicPage,
    int SortOrder,
    int FieldCount,
    int ActionCount,
    int SubmissionCount,
    DateTimeOffset UpdatedAt,
    /// <summary>A visitor must sign in to fill it on the public page.</summary>
    bool RequiresIdentification = false);

public record FormFieldDto(
    Guid Id,
    string Label,
    string? HelpText,
    FormFieldType Type,
    bool IsRequired,
    /// <summary>The offered answers, already split. Empty for the types that offer none.</summary>
    IReadOnlyList<string> Options,
    FormFieldTarget Target,
    int SortOrder);

public record FormActionDto(
    Guid Id,
    FormActionKind Kind,
    string? Recipients,
    string? Subject,
    ClientStatus NewClientStatus,
    /// <summary>The kind of asset a CreerActifClient files. Null is an asset with no kind.</summary>
    Guid? NewAssetTypeId,
    string? NewAssetTypeName,
    string? NewAssetUsageUnit,
    bool IsActive,
    int SortOrder);

/// <summary>
/// Where a stranger fills the form: a path on the site (the company's page, opening this form),
/// or why there is none yet, worded as the step that would make one.
/// </summary>
public record FormPublicLinkDto(string? Path, string? Missing);

/// <summary>Who gets the form's link, and an optional note from the sender.</summary>
public record SendFormLinkRequest(string? Email, string? Name, string? Message);

/// <summary>
/// The client whose record the answers will go to without a sign-in, when the address is one
/// the company has on file and the form files on a client's record. Null otherwise.
/// </summary>
public record SendFormLinkResultDto(string? ClientName, bool FilesOnClient);

/// <summary>The whole form: the record, its questions and what a filled copy sets off.</summary>
public record FormTemplateDetailDto(
    FormTemplateDto Form,
    IReadOnlyList<FormFieldDto> Fields,
    IReadOnlyList<FormActionDto> Actions);

public record SaveFormTemplateRequest(
    string Title,
    string? Description = null,
    string? SuccessMessage = null,
    FormKind Kind = FormKind.Defaut,
    bool IsPublished = false,
    bool ShowOnPublicPage = false,
    int SortOrder = 0,
    bool RequiresIdentification = false);

/// <param name="Id">
/// The question being kept, or null for a new one. A question that was on the form and is not in
/// this list is deleted — the answers already given to it stay, carrying their own copy of the
/// label (see FormAnswer).
/// </param>
public record SaveFormFieldRequest(
    Guid? Id,
    string Label,
    FormFieldType Type,
    bool IsRequired = false,
    string? HelpText = null,
    /// <summary>The offered answers, one per line, for a Choix or a MultiChoix.</summary>
    IReadOnlyList<string>? Options = null,
    FormFieldTarget Target = FormFieldTarget.Aucun);

/// <summary>
/// The questions in the order they are to be asked. It is the whole list every time: what is
/// sent replaces what the form had, which is what makes reordering and deleting one save.
/// </summary>
public record SaveFormFieldsRequest(IReadOnlyList<SaveFormFieldRequest> Fields);

public record SaveFormActionRequest(
    Guid? Id,
    FormActionKind Kind,
    string? Recipients = null,
    string? Subject = null,
    ClientStatus NewClientStatus = ClientStatus.Prospect,
    Guid? NewAssetTypeId = null,
    string? NewAssetUsageUnit = null,
    bool IsActive = true);

public record SaveFormActionsRequest(IReadOnlyList<SaveFormActionRequest> Actions);

// ---- Filled copies ----

public record FormAnswerDto(
    Guid Id,
    Guid? FormFieldId,
    string Label,
    FormFieldType Type,
    /// <summary>The answer as text. For a Fichier, the uploaded file's name.</summary>
    string? Value,
    /// <summary>The uploaded file, for a Fichier. Null once it has been deleted from the library.</summary>
    Guid? MediaAssetId,
    int SortOrder);

public record FormSubmissionDto(
    Guid Id,
    Guid FormTemplateId,
    string FormTitle,
    string? SubmittedByName,
    /// <summary>True when a stranger filled it on the company's public page.</summary>
    bool FromPublicPage,
    Guid? CreatedClientId,
    string? CreatedClientName,
    Guid? CreatedClientAssetId,
    string? CreatedClientAssetLabel,
    /// <summary>What the actions did, failures included. Null when the form sets nothing off.</summary>
    string? ActionLog,
    int AnswerCount,
    DateTimeOffset CreatedAt,
    /// <summary>The form's kind, so a request for a price can offer « Créer une soumission ».</summary>
    FormKind FormKind,
    Guid? CreatedQuoteId,
    int? CreatedQuoteNumber);

public record FormSubmissionDetailDto(FormSubmissionDto Submission, IReadOnlyList<FormAnswerDto> Answers);

/// <param name="Value">
/// The answer as text, whatever the type. A MultiChoix sends its chosen labels joined by a
/// comma, which is how it is stored and how it is e-mailed on.
/// </param>
public record SubmitFormAnswer(
    Guid FieldId,
    string? Value,
    /// <summary>
    /// For a Fichier question: a file already uploaded through the media routes. The file's
    /// name is read from the asset rather than taken from <see cref="Value"/>, so the caller
    /// cannot label somebody else's file whatever it likes.
    /// </summary>
    Guid? MediaAssetId = null);

public record SubmitFormRequest(IReadOnlyList<SubmitFormAnswer> Answers);

/// <summary>
/// What to say to whoever just submitted it, and what the form managed to do.
///
/// The second part is shown and not swallowed: a form whose e-mail did not leave has to say so
/// on the spot, or the person walks away believing the office has been told.
/// </summary>
public record SubmitFormResultDto(FormSubmissionDetailDto Submission, string SuccessMessage, string? ActionLog);

/// <summary>
/// One form on the Réponses list: what it is called, and what has come back.
/// </summary>
/// <param name="LastSubmissionAt">Null when nobody has filled it yet.</param>
public record FormResponsesSummaryDto(
    Guid Id,
    string Title,
    FormKind Kind,
    bool IsPublished,
    int SubmissionCount,
    DateTimeOffset? LastSubmissionAt);
