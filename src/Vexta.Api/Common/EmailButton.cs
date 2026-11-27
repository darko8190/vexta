using System.Text.RegularExpressions;

namespace Vexta.Api.Common;

/// <summary>
/// The colour of a button in an e-mail: the company's own when it chose one, Vexta's blue
/// otherwise. Checked against the stored #RRGGBB pattern rather than trusted, since it ends up
/// inside a style attribute.
/// </summary>
public static partial class EmailButton
{
    public const string DefaultColour = "#0982CE";

    public static string Colour(string? brandColor) =>
        brandColor is not null && HexColour().IsMatch(brandColor) ? brandColor : DefaultColour;

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColour();
}
