using Vexta.Api.Domain;

namespace Vexta.Api.Features.Personal;

/// <summary>
/// Somebody's own CV, as they see it.
///
/// <see cref="IsComplete"/> and <see cref="Missing"/> are both here on purpose. A screen that
/// says "incomplete" without saying what is missing makes the person guess, and this is the
/// gate between them and applying for a job.
/// </summary>
public record PersonalProfileDto(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Headline,
    string? Summary,
    string? City,
    string? Province,
    string? Country,
    DateOnly? AvailableFrom,
    string? Skills,
    Guid? ResumeMediaAssetId,
    string? ResumeFileName,
    List<PersonalExperienceDto> Experiences,
    List<PersonalEducationDto> Education,
    bool IsComplete,
    /// <summary>What still has to be filled in before an application can be sent, in French.</summary>
    List<string> Missing,
    /// <summary>
    /// Whether there is anything on this CV beyond a name, which is what decides whether there
    /// is a document to render. Answered here rather than worked out again in the browser: the
    /// rule belongs to the thing that draws the document, and two copies of it would disagree
    /// the first time one of them changed.
    /// </summary>
    bool HasContent,
    DateTimeOffset? UpdatedAt);

public record PersonalExperienceDto(
    Guid Id,
    string Title,
    string? Employer,
    string? Location,
    DateOnly? StartedOn,
    DateOnly? EndedOn,
    string? Description,
    int SortOrder);

public record PersonalEducationDto(
    Guid Id,
    string Program,
    string? School,
    int? CompletedYear,
    string? Notes,
    int SortOrder);

/// <summary>
/// The whole CV in one save, including both lists.
///
/// One request rather than a dozen: this is one screen somebody fills in in one sitting, and
/// splitting it would mean a half-saved CV when a row fails -- on the record that decides
/// whether they can apply at all.
/// </summary>
public record SavePersonalProfileRequest(
    string? Phone,
    string? Headline,
    string? Summary,
    string? City,
    string? Province,
    string? Country,
    DateOnly? AvailableFrom,
    string? Skills,
    Guid? ResumeMediaAssetId,
    List<SavePersonalExperienceRequest>? Experiences,
    List<SavePersonalEducationRequest>? Education);

public record SavePersonalExperienceRequest(
    string Title,
    string? Employer,
    string? Location,
    DateOnly? StartedOn,
    DateOnly? EndedOn,
    string? Description);

public record SavePersonalEducationRequest(
    string Program,
    string? School,
    int? CompletedYear,
    string? Notes);

/// <summary>One position this person has applied to, as they see it from their own side.</summary>
public record MyApplicationDto(
    Guid CandidateId,
    Guid? JobPostingId,
    string JobTitle,
    string CompanyName,
    string? CompanySlug,
    CandidateStatus Status,
    DateOnly AppliedOn);
