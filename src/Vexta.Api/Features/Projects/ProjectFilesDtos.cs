namespace Vexta.Api.Features.Projects;

// The two halves of the project's "Documents et notes" tab. They travel together here because
// they are one screen, even though they are two resources with two different audiences.

/// <summary>
/// A file filed against the job, with a link that works right now. The URL is signed on the way
/// out and expires, which is why it is handed over with the list rather than kept anywhere: a
/// stored link is a link that has stopped working by the time anyone clicks it.
/// </summary>
public record ProjectDocumentDto(
    Guid Id,
    string Title,
    string? Category,
    Guid MediaAssetId,
    string FileName,
    string ContentType,
    long SizeBytes,
    string? Url,
    string? UploadedByName,
    DateTimeOffset CreatedAt);

/// <param name="MediaAssetId">
/// The file, already uploaded to the library by the browser. The document row only points at
/// it, so the same file can be referenced from elsewhere without being copied.
/// </param>
public record SaveProjectDocumentRequest(
    string Title,
    string? Category,
    Guid MediaAssetId);

/// <summary>
/// One entry in the job's thread. The author's name is resolved here rather than stored, so a
/// change of name does not leave old entries signed with the old one.
/// </summary>
public record ProjectNoteDto(
    Guid Id,
    string Body,
    string? AuthorName,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record SaveProjectNoteRequest(string Body);
