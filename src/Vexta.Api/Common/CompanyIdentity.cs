using System.Globalization;
using System.Text;

namespace Vexta.Api.Common;

/// <summary>
/// How two records are judged to be the same company.
///
/// This is the whole of the matching rule, in one place, because it is used from two directions
/// that must agree exactly: a supplier's address key is computed when the supplier is saved, and
/// a company's own address key is computed when it signs up. If the two normalised differently,
/// a company would sign up and quietly match nothing -- a failure with no error message
/// anywhere, which is the hardest kind to notice.
///
/// Addresses are typed by people. "123, rue Principale" and "123 rue principale" are the same
/// place, as are "G1R 2B5" and "g1r2b5", and refusing to see that would make the feature useless
/// in exactly the cases it is for.
/// </summary>
public static class CompanyIdentity
{
    /// <summary>Legal forms, which are the same company with or without them.</summary>
    private static readonly string[] Suffixes =
    [
        "inc", "inc.", "incorporee", "ltee", "ltd", "limited", "limitee", "enr", "enr.",
        "senc", "s.e.n.c", "sencrl", "cie", "co", "corp", "corporation", "sa", "sarl", "llc", "lp"
    ];

    /// <summary>
    /// Case, accents and punctuation removed, runs of whitespace collapsed. The common first
    /// step for every comparison below, so "Béton Lévis" and "BETON LEVIS" are one thing.
    /// </summary>
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;

        var stripped = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(stripped.Length);

        foreach (var ch in stripped)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;

            if (char.IsLetterOrDigit(ch))
            {
                builder.Append(char.ToLowerInvariant(ch));
            }
            else if (builder.Length > 0 && builder[^1] != ' ')
            {
                builder.Append(' ');
            }
        }

        return builder.ToString().Trim();
    }

    /// <summary>
    /// The key two records must share to be at the same address: the postal code and the street
    /// line, with nothing else in it.
    ///
    /// The city and the province are deliberately left out. They are the parts people get wrong
    /// -- a Lévis address written as Québec, a borough instead of a city -- while a postal code
    /// plus a civic number is already precise to one side of one street. Including them would
    /// only add ways for the same place to produce two different keys.
    ///
    /// Null when either part is missing: a key built from half an address would match companies
    /// that merely share a postal code, which in a rural route can be a whole village.
    /// </summary>
    public static string? AddressKey(string? line1, string? postalCode)
    {
        var street = Normalize(line1).Replace(" ", "");
        var code = Normalize(postalCode).Replace(" ", "");

        if (street.Length == 0 || code.Length == 0) return null;

        return $"{code}|{street}";
    }

    /// <summary>
    /// A company name with its legal form and its punctuation taken off, for comparison only.
    /// Never shown to anybody: "beton levis" is not how the company writes its own name.
    /// </summary>
    public static string NameKey(string? name)
    {
        var words = Normalize(name)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(word => !Suffixes.Contains(word))
            .ToArray();

        return string.Join(' ', words);
    }

    /// <summary>
    /// Words that say what a company does rather than which company it is. A match resting on
    /// one of these alone is not a match: half the register is a Construction something.
    /// </summary>
    private static readonly string[] Generic =
    [
        "construction", "constructions", "entreprise", "entreprises", "transport", "transports",
        "service", "services", "groupe", "les", "la", "le", "du", "de", "des", "et", "fils",
        "plomberie", "electricite", "electrique", "excavation", "renovation", "renovations",
        "toiture", "toitures", "materiaux", "quincaillerie", "location", "locations"
    ];

    /// <summary>
    /// Whether two names are close enough to be the same company, given that the addresses
    /// already matched.
    ///
    /// Compared word by word, not as whole strings. The difference between the two spellings of
    /// a company is almost always a word one of them leaves out or puts in the plural: "Béton
    /// Lévis" against "Les Bétons Lévis inc.", "Garage Roy" against "Garage Roy et Fils". A
    /// comparison of whole strings misses every one of those -- it was written that way first,
    /// and the plural in "Bétons" was enough to break it.
    ///
    /// Every word of the shorter name must be found in the longer one, where a word of four
    /// letters or more also matches a longer word starting with it, so "beton" finds "betons".
    /// And at least one of the words that matched has to actually identify the company: two
    /// firms called Construction something, at one address, are not the same firm.
    ///
    /// A same-address pair that fails this is left alone rather than linked. Two companies at
    /// one address is ordinary -- a mall, an industrial park, a landlord and its tenant -- and
    /// an address is not an identity. Nothing is lost by refusing: the company can still be
    /// found by name in the directory, and the card can be filled from it by hand.
    /// </summary>
    public static bool NamesLookAlike(string? left, string? right)
    {
        var a = Words(left);
        var b = Words(right);

        if (a.Length == 0 || b.Length == 0) return false;

        var (shorter, longer) = a.Length <= b.Length ? (a, b) : (b, a);

        var distinctive = false;

        foreach (var word in shorter)
        {
            var hit = longer.FirstOrDefault(other => WordsMatch(word, other));
            if (hit is null) return false;

            if (word.Length >= 4 && !Generic.Contains(word)) distinctive = true;
        }

        return distinctive;
    }

    private static string[] Words(string? name) =>
        NameKey(name).Split(' ', StringSplitOptions.RemoveEmptyEntries);

    /// <summary>
    /// Two words of a company name are the same word. Exact, or -- from four letters up -- one
    /// being the start of the other, which is what carries plurals and the odd abbreviation.
    /// The length floor is what stops "roy" matching "royal" and every three-letter word
    /// matching half the register.
    /// </summary>
    private static bool WordsMatch(string left, string right)
    {
        if (left == right) return true;
        if (left.Length < 4 || right.Length < 4) return false;

        var (shorter, longer) = left.Length <= right.Length ? (left, right) : (right, left);
        return longer.StartsWith(shorter, StringComparison.Ordinal);
    }
}
