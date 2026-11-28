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
/// What one column of a built public page holds.
///
/// Stored as numbers, so new kinds are appended.
/// </summary>
public enum PublicPageSectionKind
{
    /// <summary>A heading and some paragraphs.</summary>
    Texte = 0,

    /// <summary>One of the company's galleries, as a grid.</summary>
    Galerie = 1,

    /// <summary>The products ticked as public.</summary>
    Produits = 2,

    /// <summary>The positions being advertised.</summary>
    Emplois = 3,

    /// <summary>The forms ticked for the page, each behind a button.</summary>
    Formulaires = 4,

    /// <summary>A single photograph, the width of its column.</summary>
    Image = 5,

    /// <summary>One form chosen by the owner, its questions printed in the column.</summary>
    Formulaire = 6
}

/// <summary>How the products or postings of a column are drawn.</summary>
public enum PageItemShape
{
    /// <summary>A card with a wide picture. The way it always was.</summary>
    Rectangle = 0,

    /// <summary>A square tile.</summary>
    Carre = 1,

    /// <summary>A round picture with the words under it.</summary>
    Rond = 2
}

/// <summary>What is behind a band: nothing, a soft tint, or the company's colour.</summary>
public enum PageSectionBackground
{
    Aucun = 0,
    Doux = 1,
    Couleur = 2
}

/// <summary>
/// One column of a band, and what it shows.
///
/// Kept as JSON on its band rather than a table of its own: a column is never looked up on its
/// own, it is read and written with the band it sits in, every time.
/// </summary>
public class PageCell
{
    public PublicPageSectionKind Kind { get; set; }

    /// <summary>The heading above the column. Null prints none.</summary>
    public string? Title { get; set; }

    /// <summary>The paragraphs, for a Texte.</summary>
    public string? Text { get; set; }

    /// <summary>The gallery, for a Galerie. A gallery deleted since is skipped.</summary>
    public Guid? GalleryId { get; set; }

    /// <summary>The photograph, for an Image.</summary>
    public Guid? MediaAssetId { get; set; }

    /// <summary>The form, for a Formulaire.</summary>
    public Guid? FormTemplateId { get; set; }

    /// <summary>How many products, postings or photographs side by side, 1 to 6.</summary>
    public int ItemsPerRow { get; set; } = 3;

    public PageItemShape Shape { get; set; } = PageItemShape.Rectangle;
}

/// <summary>
/// One band of the company's public page, in the order it was arranged.
///
/// The page has a fixed head and a fixed foot — the name and the way to reach them — and these
/// are what goes between. A company with no sections at all still gets a page: the arrangement
/// the application has always drawn.
///
/// A band is a row of one to twelve columns of equal width, each saying what it shows. On a
/// telephone the columns stack, whatever was chosen.
/// </summary>
public class PublicPageSection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    /// <summary>The heading above the whole band. Null prints none.</summary>
    public string? Title { get; set; }

    /// <summary>The columns, as JSON. Read and written through <see cref="PageCells"/>.</summary>
    public string CellsJson { get; set; } = "[]";

    /// <summary>
    /// The forms the columns print, kept beside the JSON so the form gate can ask "is this form
    /// on the page" in SQL.
    /// </summary>
    public List<Guid> FormTemplateIds { get; set; } = [];

    public PageSectionBackground Background { get; set; }

    /// <summary>
    /// Turned off rather than deleted while something is being tried, so the arrangement that
    /// worked last month is still there to turn back on.
    /// </summary>
    public bool IsVisible { get; set; } = true;

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>The one place the columns are turned into JSON and back.</summary>
public static class PageCells
{
    private static readonly System.Text.Json.JsonSerializerOptions Options = new();

    public static List<PageCell> Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<List<PageCell>>(json, Options) ?? [];
        }
        catch (System.Text.Json.JsonException)
        {
            return [];
        }
    }

    public static string Write(IEnumerable<PageCell> cells) =>
        System.Text.Json.JsonSerializer.Serialize(cells.ToList(), Options);
}
