using Vexta.Api.Domain;

namespace Vexta.Api.Features.Company;

// ---- Galeries ----

/// <param name="CoverUrl">
/// The first photograph, signed for this response. Null when the set is empty or when storage
/// could not be reached — a card without a picture, never a screen that fails.
/// </param>
public record GalleryDto(
    Guid Id,
    string Name,
    string? Description,
    int SortOrder,
    int ImageCount,
    string? CoverUrl,
    DateTimeOffset UpdatedAt);

/// <param name="Url">Signed for this response; the bucket is never public.</param>
public record GalleryImageDto(
    Guid Id,
    Guid MediaAssetId,
    string FileName,
    string? Caption,
    string? Url,
    int SortOrder);

public record GalleryDetailDto(GalleryDto Gallery, IReadOnlyList<GalleryImageDto> Images);

public record SaveGalleryRequest(string Name, string? Description = null, int SortOrder = 0);

/// <param name="Id">
/// The placement being kept, or null for a new one. One that was in the gallery and is not in
/// this list is removed — the file itself stays in the library.
/// </param>
public record SaveGalleryImageRequest(Guid? Id, Guid MediaAssetId, string? Caption = null);

public record SaveGalleryImagesRequest(IReadOnlyList<SaveGalleryImageRequest> Images);

// ---- The page builder ----

/// <param name="GalleryName">So the builder can name the gallery without fetching the list.</param>
/// <param name="ImageUrl">The chosen photograph, for an Image section. Signed for this response.</param>
public record PageSectionDto(
    Guid Id,
    PublicPageSectionKind Kind,
    string? Title,
    string? Text,
    Guid? GalleryId,
    string? GalleryName,
    Guid? MediaAssetId,
    string? ImageUrl,
    int Columns,
    bool IsVisible,
    int SortOrder);

public record SavePageSectionRequest(
    Guid? Id,
    PublicPageSectionKind Kind,
    string? Title = null,
    string? Text = null,
    Guid? GalleryId = null,
    Guid? MediaAssetId = null,
    int Columns = 1,
    bool IsVisible = true);

/// <summary>
/// The bands of the page, in the order they are to be read. The whole list replaces the whole
/// list, like a form's questions: arranging a page is reordering, retitling and removing in one
/// sitting, and a screen that saved each change on its own would be a screen where half an
/// arrangement is a page nobody chose.
/// </summary>
public record SavePageSectionsRequest(IReadOnlyList<SavePageSectionRequest> Sections);
