using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Vexta.Api.Common;

/// <summary>
/// The messages people write and read are plain text; only the mail that leaves is HTML.
///
/// Templates used to be written in HTML, so a contractor editing their invoice message met
/// &lt;p&gt; and &lt;strong&gt; and had to work around them. Now they type lines and blank
/// lines, as in any mail app, and this turns them into paragraphs on the way out. Templates
/// saved in the old form are read back through <see cref="ToPlain"/>, so nobody has to rewrite
/// theirs.
/// </summary>
public static partial class EmailText
{
    [GeneratedRegex(@"<\s*/?\s*(p|br|strong|b|em|i|a|div|span|ul|ol|li)\b[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex MarkupTag();

    [GeneratedRegex(@"<a\b[^>]*href\s*=\s*""([^""]*)""[^>]*>(.*?)</a\s*>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex Anchor();

    [GeneratedRegex(@"<br\s*/?>", RegexOptions.IgnoreCase)]
    private static partial Regex LineBreak();

    [GeneratedRegex(@"</\s*(p|div|li)\s*>", RegexOptions.IgnoreCase)]
    private static partial Regex BlockEnd();

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex AnyTag();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex ExtraBlankLines();

    [GeneratedRegex(@"https?://[^\s<]+[^\s<.,;:!?)»]")]
    private static partial Regex Url();

    /// <summary>
    /// Text with any old markup taken out: paragraphs become blank lines, a link keeps both its
    /// words and its address. Plain text goes through unchanged.
    /// </summary>
    public static string ToPlain(string text)
    {
        if (!MarkupTag().IsMatch(text)) return text.Replace("\r\n", "\n").Trim();

        var plain = text.Replace("\r\n", "\n");
        // Indentation and line breaks inside the old HTML meant nothing; only tags did.
        plain = string.Join(" ", plain.Split('\n').Select(l => l.Trim()));
        plain = Anchor().Replace(plain, m =>
        {
            var href = WebUtility.HtmlDecode(m.Groups[1].Value);
            var words = WebUtility.HtmlDecode(AnyTag().Replace(m.Groups[2].Value, "")).Trim();
            return words.Length == 0 || words == href ? href : $"{words} ({href})";
        });
        plain = LineBreak().Replace(plain, "\n");
        plain = BlockEnd().Replace(plain, "\n\n");
        plain = AnyTag().Replace(plain, "");
        plain = WebUtility.HtmlDecode(plain);
        plain = string.Join("\n", plain.Split('\n').Select(l => l.Trim()));
        return ExtraBlankLines().Replace(plain, "\n\n").Trim();
    }

    /// <summary>
    /// The mail's HTML: every character escaped, a blank line starting a new paragraph, a
    /// single line break kept as one, and web addresses made clickable.
    /// </summary>
    public static string ToHtml(string plain)
    {
        var paragraphs = ToPlain(plain).Split("\n\n", StringSplitOptions.RemoveEmptyEntries);
        var html = new StringBuilder();

        foreach (var paragraph in paragraphs)
        {
            var encoded = WebUtility.HtmlEncode(paragraph.Trim());
            // Matched on the encoded text, so an address's & is already &amp; — which is what an
            // href attribute wants anyway.
            encoded = Url().Replace(encoded, m => $"<a href=\"{m.Value}\">{m.Value}</a>");
            html.Append("<p>").Append(encoded.Replace("\n", "<br>")).Append("</p>\n");
        }

        return html.ToString();
    }
}
