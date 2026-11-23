using Vexta.Api.Data;
using Vexta.Api.Services;

namespace Vexta.Api.Features.ImportExport;

/// <param name="Problems">One line per row that could not be taken, saying which row and why.</param>
public record ImportReport(int Created, int Updated, int Skipped, IReadOnlyList<string> Problems);

/// <summary>
/// One importable list, and the sheets that travel with it.
///
/// The template and the export are deliberately the same workbook, with and without the rows.
/// That is what makes the round trip work: export a list, change a column in Excel, import it
/// back. A template shaped differently from the export would make that an error every time.
///
/// The sub-sheets are the point of exporting a workbook rather than a CSV. A client is not one
/// row — it is a row plus its contacts plus its addresses — and a format that can only carry
/// the first is a format that loses the other two.
/// </summary>
public interface IEntityWorkbook
{
    /// <summary>The slug in the URL, such as "clients".</summary>
    string Slug { get; }

    /// <summary>What the downloaded file is called, before the date is appended.</summary>
    string FileName { get; }

    /// <summary>Headers and one filled-in example row per sheet.</summary>
    IReadOnlyList<WorkbookSheet> Template();

    Task<IReadOnlyList<WorkbookSheet>> ExportAsync(VextaDbContext db, Guid tenantId, CancellationToken ct);

    Task<ImportReport> ImportAsync(
        VextaDbContext db,
        Guid tenantId,
        IReadOnlyDictionary<string, IReadOnlyList<WorkbookRow>> sheets,
        CancellationToken ct);
}

/// <summary>Reading the odd shapes a spreadsheet hands back, shared by all four workbooks.</summary>
public static class Cell
{
    /// <summary>
    /// Yes unless it plainly says no. "oui", "x", "vrai", "1" and "true" all mean yes, because
    /// four people filling the same column will write four different things.
    /// </summary>
    public static bool Flag(string? value, bool fallback = false)
    {
        if (string.IsNullOrWhiteSpace(value)) return fallback;

        return WorkbookService.Normalise(value) switch
        {
            "oui" or "o" or "x" or "vrai" or "true" or "1" or "yes" or "y" => true,
            "non" or "n" or "faux" or "false" or "0" or "no" => false,
            _ => fallback,
        };
    }

    public static string Yes(bool value) => value ? "oui" : "non";

    /// <summary>
    /// Accepts the comma as a decimal separator, and a dollar sign, and the space Excel puts in
    /// thousands. A contractor typing "1 234,50 $" means one thousand two hundred thirty-four
    /// and a half, and refusing that is refusing the way the whole province writes money.
    /// </summary>
    public static decimal? Amount(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var cleaned = new string(value
            .Where(c => char.IsDigit(c) || c is '.' or ',' or '-')
            .ToArray())
            .Replace(',', '.');

        return decimal.TryParse(cleaned, System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out var result)
            ? result
            : null;
    }

    public static int? Count(string? value) => Amount(value) is { } d ? (int)Math.Round(d) : null;

    /// <summary>ISO first, then whatever the machine's culture makes of it.</summary>
    public static DateOnly? Date(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Trim();

        if (DateOnly.TryParseExact(text, "yyyy-MM-dd", out var iso)) return iso;
        if (DateOnly.TryParse(text, out var parsed)) return parsed;
        if (DateTime.TryParse(text, out var stamp)) return DateOnly.FromDateTime(stamp);

        // Excel sometimes hands back the serial number rather than the date it drew.
        if (double.TryParse(text, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var serial)
            && serial is > 20_000 and < 80_000)
        {
            return DateOnly.FromDateTime(DateTime.FromOADate(serial));
        }

        return null;
    }

    public static string? Text(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static string Iso(DateOnly? date) => date?.ToString("yyyy-MM-dd") ?? "";

    public static string Money(decimal? amount) =>
        amount?.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) ?? "";

    /// <summary>Matches an enum by name, accents and case ignored, falling back to the default.</summary>
    public static T Enum<T>(string? value, T fallback) where T : struct, System.Enum
    {
        if (string.IsNullOrWhiteSpace(value)) return fallback;

        var wanted = WorkbookService.Normalise(value);
        foreach (var candidate in System.Enum.GetValues<T>())
        {
            if (WorkbookService.Normalise(candidate.ToString()) == wanted) return candidate;
        }

        return fallback;
    }
}
