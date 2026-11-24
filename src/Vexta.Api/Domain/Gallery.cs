namespace Vexta.Api.Domain;

/// <summary>
/// A named set of photographs the company keeps to show: réalisations, avant-après, un chantier
/// en particulier.
///
/// Its own record rather than a pile of images hung on the public page, because the point of
/// naming them is reuse. A roofer builds "Toitures 2026" once and puts it on the page this
/// spring, on a second page next year, and leaves it alone in between. Images hung directly on
/// a page would have to be chosen again every time the page changed.
/// </summary>
public class Gallery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Name { get; set; }

    /// <summary>A line under the title, when the set needs one. Shown wherever it is placed.</summary>
    public string? Description { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<GalleryImage> Images { get; set; } = [];
}

/// <summary>
/// One photograph in a gallery, in the order it was put there.
///
/// The bytes live in the shared bucket through <see cref="MediaAsset"/>, like every other
/// upload. This row is the placement: which file, where in the set, and what it is called.
/// </summary>
public class GalleryImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid GalleryId { get; set; }
    public Gallery? Gallery { get; set; }

    /// <summary>
    /// The file. Cascade on delete, unlike a form answer that keeps the name of a file it lost:
    /// a photograph that is gone is nothing to look at, and a row for it would be a hole in a
    /// grid that nobody can fix except by finding and removing it.
    /// </summary>
    public Guid MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    /// <summary>What it is a picture of. Null shows the photograph with nothing written on it.</summary>
    public string? Caption { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// What one band of a built public page holds.
///
/// A short list rather than a block editor, for the same reason the page has seven arrangements
/// rather than a stylesheet: a company that can produce an unreadable page will, and it is its
/// name on the result. Each kind here is one a contractor can explain to themselves, and every
/// one of them is laid out by the application rather than by the person placing it.
///
/// Stored as numbers, so new kinds are appended.
/// </summary>
public enum PublicPageSectionKind
{
    /// <summary>A heading and some paragraphs. The one that carries whatever the others cannot.</summary>
    Texte = 0,

    /// <summary>One of the company's galleries, as a grid.</summary>
    Galerie = 1,

    /// <summary>The products ticked as public, the same ones the fixed page shows.</summary>
    Produits = 2,

    /// <summary>The positions being advertised.</summary>
    Emplois = 3,

    /// <summary>The forms ticked for the page.</summary>
    Formulaires = 4,

    /// <summary>A single photograph, full width. A site, a team, a finished roof.</summary>
    Image = 5
}

/// <summary>
/// One band of the company's public page, in the order it was arranged.
///
/// The page has a fixed head and a fixed foot — the name and the way to reach them — and these
/// are what goes between. A company with no sections at all still gets a page: the arrangement
/// the application has always drawn. That fallback is the whole reason this is safe to ship,
/// because nobody's page changes until they decide to build one.
///
/// Columns are the only layout decision offered, and they only arrange a section's own content:
/// a gallery three across, a text in two columns. There is no grid to understand and no way to
/// put two unrelated things side by side, which is where every page builder starts producing
/// pages nobody can read on a telephone.
/// </summary>
public class PublicPageSection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public PublicPageSectionKind Kind { get; set; }

    /// <summary>
    /// The heading above it. Null prints no heading at all, which is what a full-width
    /// photograph usually wants.
    /// </summary>
    public string? Title { get; set; }

    /// <summary>The paragraphs, for a Texte. Line breaks are the only structure it has.</summary>
    public string? Text { get; set; }

    /// <summary>
    /// The gallery, for a Galerie. SetNull when it is deleted, and the page then skips the
    /// section rather than printing an empty frame.
    /// </summary>
    public Guid? GalleryId { get; set; }
    public Gallery? Gallery { get; set; }

    /// <summary>The photograph, for an Image. SetNull for the same reason as the gallery.</summary>
    public Guid? MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    /// <summary>
    /// One, two or three across. What it arranges depends on the kind — photographs in a
    /// gallery, columns of a text — and a kind that has nothing to arrange ignores it.
    /// </summary>
    public int Columns { get; set; } = 1;

    /// <summary>
    /// Turned off rather than deleted while something is being tried, so the arrangement that
    /// worked last month is still there to turn back on.
    /// </summary>
    public bool IsVisible { get; set; } = true;

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
