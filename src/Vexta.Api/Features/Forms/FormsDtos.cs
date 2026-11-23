using Vexta.Api.Domain;

namespace Vexta.Api.Features.Forms;

// ---- The form itself ----

/// <summary>A form as the list shows it: enough to pick one, not enough to fill it.</summary>
public record FormTemplateDto(
    Guid Id,
    string Title,
    string? Description,
    string? SuccessMessage,
    bool IsPublished,
    int SortOrder,
    int FieldCount,
    int ActionCount,
    int SubmissionCount,
    DateTimeOffset UpdatedAt);

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
    bool IsActive,
    int SortOrder);

/// <summary>The whole form: the record, its questions and what a filled copy sets off.</summary>
public record FormTemplateDetailDto(
    FormTemplateDto Form,
    IReadOnlyList<FormFieldDto> Fields,
    IReadOnlyList<FormActionDto> Actions);

public record SaveFormTemplateRequest(
    string Title,
    string? Description = null,
    string? SuccessMessage = null,
    bool IsPublished = false,
    int SortOrder = 0);

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
    bool IsActive = true);

public record SaveFormActionsRequest(IReadOnlyList<SaveFormActionRequest> Actions);

// ---- Filled copies ----

public record FormAnswerDto(Guid Id, Guid? FormFieldId, string Label, FormFieldType Type, string? Value, int SortOrder);

public record FormSubmissionDto(
    Guid Id,
    Guid FormTemplateId,
    string FormTitle,
    string? SubmittedByName,
    Guid? CreatedClientId,
    string? CreatedClientName,
    /// <summary>What the actions did, failures included. Null when the form sets nothing off.</summary>
    string? ActionLog,
    int AnswerCount,
    DateTimeOffset CreatedAt);

public record FormSubmissionDetailDto(FormSubmissionDto Submission, IReadOnlyList<FormAnswerDto> Answers);

/// <param name="Value">
/// The answer as text, whatever the type. A MultiChoix sends its chosen labels joined by a
/// comma, which is how it is stored and how it is e-mailed on.
/// </param>
public record SubmitFormAnswer(Guid FieldId, string? Value);

public record SubmitFormRequest(IReadOnlyList<SubmitFormAnswer> Answers);

/// <summary>
/// What to say to whoever just submitted it, and what the form managed to do.
///
/// The second part is shown and not swallowed: a form whose e-mail did not leave has to say so
/// on the spot, or the person walks away believing the office has been told.
/// </summary>
public record SubmitFormResultDto(FormSubmissionDetailDto Submission, string SuccessMessage, string? ActionLog);
