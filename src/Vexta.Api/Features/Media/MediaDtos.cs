namespace Vexta.Api.Features.Media;

/// <param name="SizeBytes">What R2 stores, which is what Cloudflare bills for.</param>
/// <param name="OriginalSizeBytes">
/// What the file weighed before compression. Equal to <paramref name="SizeBytes"/> when the file
/// was stored as-is.
/// </param>
public record MediaAssetDto(
    Guid Id,
    string FileName,
    string ContentType,
    long SizeBytes,
    long OriginalSizeBytes,
    string? ContentEncoding,
    DateTimeOffset CreatedAt);

/// <summary>
/// Asked before uploading, so the file goes to R2 without passing through the API.
/// <paramref name="ContentEncoding"/> is "gzip" when the browser compressed the bytes; it has to
/// be known now because it is signed into the upload URL.
/// </summary>
public record CreateUploadRequest(
    string FileName, string ContentType, long SizeBytes, string? ContentEncoding);

/// <summary>The key is what the browser echoes back to confirm; the row's own id is assigned then.</summary>
public record CreateUploadResponse(string ObjectKey, string UploadUrl);

/// <summary>
/// Sent once the browser's PUT succeeded. The row is only written here, so a failed upload
/// leaves no entry in the library.
/// </summary>
public record ConfirmUploadRequest(
    string ObjectKey,
    string FileName,
    string ContentType,
    long SizeBytes,
    long OriginalSizeBytes,
    string? ContentEncoding);

public record MediaLinkDto(string Url);

public record RenameMediaRequest(string FileName);
