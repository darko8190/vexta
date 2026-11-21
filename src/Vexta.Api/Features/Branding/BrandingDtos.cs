namespace Vexta.Api.Features.Branding;

/// <summary>
/// One entry per slot, so the front end knows which images were replaced without downloading
/// any of them.
/// </summary>
public record BrandingSlotDto(
    string Slot,
    bool IsUploaded,
    string? ETag,
    int Width,
    int Height);

/// <summary>
/// The image as base64. Not multipart: the front end reaches the API through a proxy route that
/// forwards JSON, and a one-off upload path for a 2 MB logo is not worth a second transport.
/// </summary>
public record UploadBrandingRequest(string ContentType, byte[] Content, int Width, int Height);
