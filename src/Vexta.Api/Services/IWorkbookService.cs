using ClosedXML.Excel;

namespace Vexta.Api.Services;

/// <param name="Name">The tab's name. Excel refuses more than 31 characters and some punctuation.</param>
/// <param name="Columns">The header row, in order.</param>
/// <param name="Rows">Values aligned to <paramref name="Columns"/>; a short row is padded.</param>
/// <param name="Note">Shown above the table, where a person will read it before typing.</param>
public record WorkbookSheet(
    string Name,
    IReadOnlyList<string> Columns,
    IReadOnlyList<IReadOnlyList<string?>> Rows,
    string? Note = null);

/// <summary>One row as it was read, with the line number so a complaint can point at it.</summary>
public record WorkbookRow(int LineNumber, IReadOnlyDictionary<string, string> Values)
{
    /// <summary>Case- and accent-tolerant: a header retyped by hand is rarely retyped exactly.</summary>
    public string? Get(string column) =>
        Values.TryGetValue(WorkbookService.Normalise(column), out var value) && value.Length > 0 ? value : null;

    public bool IsEmpty => Values.Values.All(string.IsNullOrWhiteSpace);
}

public interface IWorkbookService
{
    byte[] Write(IReadOnlyList<WorkbookSheet> sheets);

    /// <summary>
    /// Reads a workbook back. Sheets are matched by name, headers by their normalised form, and
    /// everything comes back as text: a postal code that Excel decided was a number is still a
    /// postal code, and parsing is the caller's business because only the caller knows what the
    /// column means.
    /// </summary>
    IReadOnlyDictionary<string, IReadOnlyList<WorkbookRow>> Read(Stream stream);
}

public class WorkbookService : IWorkbookService
{
    /// <summary>
    /// Where the header row sits. Row 1 holds the note, because a person opening a template
    /// reads the first line and nothing else, and "ne changez pas les en-têtes" has to be there.
    /// </summary>
    private const int HeaderRow = 2;

    public byte[] Write(IReadOnlyList<WorkbookSheet> sheets)
    {
        using var workbook = new XLWorkbook();

        foreach (var sheet in sheets)
        {
            var worksheet = workbook.Worksheets.Add(SheetName(sheet.Name));

            if (sheet.Note is { Length: > 0 } note)
            {
                var cell = worksheet.Cell(1, 1);
                cell.Value = note;
                cell.Style.Font.Italic = true;
                cell.Style.Font.FontColor = XLColor.Gray;
            }

            for (var c = 0; c < sheet.Columns.Count; c++)
            {
                var cell = worksheet.Cell(HeaderRow, c + 1);
                cell.Value = sheet.Columns[c];
                cell.Style.Font.Bold = true;
                cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#EEF2F7");
            }

            for (var r = 0; r < sheet.Rows.Count; r++)
            {
                var row = sheet.Rows[r];
                for (var c = 0; c < sheet.Columns.Count; c++)
                {
                    var value = c < row.Count ? row[c] : null;
                    if (string.IsNullOrEmpty(value)) continue;

                    // Written as text on purpose. A code like 0012, a postal code and a phone
                    // number all survive the round trip this way; left to Excel they come back
                    // as 12, a date and a float.
                    worksheet.Cell(HeaderRow + 1 + r, c + 1).SetValue(value);
                }
            }

            worksheet.SheetView.FreezeRows(HeaderRow);
            worksheet.Columns().AdjustToContents(1, 60d);
        }

        using var memory = new MemoryStream();
        workbook.SaveAs(memory);
        return memory.ToArray();
    }

    public IReadOnlyDictionary<string, IReadOnlyList<WorkbookRow>> Read(Stream stream)
    {
        using var workbook = new XLWorkbook(stream);
        var result = new Dictionary<string, IReadOnlyList<WorkbookRow>>(StringComparer.Ordinal);

        foreach (var worksheet in workbook.Worksheets)
        {
            var used = worksheet.RangeUsed();
            if (used is null) continue;

            // The header is wherever the first row with more than one filled cell is, rather
            // than always row 2: a file that has been through somebody's hands has an extra
            // line at the top as often as not.
            var headerRow = FindHeaderRow(worksheet, used.LastRow().RowNumber());
            if (headerRow is null) continue;

            var columns = new Dictionary<int, string>();
            foreach (var cell in worksheet.Row(headerRow.Value).CellsUsed())
            {
                var name = Normalise(cell.GetString());
                if (name.Length > 0) columns[cell.Address.ColumnNumber] = name;
            }

            if (columns.Count == 0) continue;

            var rows = new List<WorkbookRow>();
            for (var r = headerRow.Value + 1; r <= used.LastRow().RowNumber(); r++)
            {
                var values = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var (column, name) in columns)
                {
                    values[name] = worksheet.Cell(r, column).GetString().Trim();
                }

                var row = new WorkbookRow(r, values);
                if (!row.IsEmpty) rows.Add(row);
            }

            result[Normalise(worksheet.Name)] = rows;
        }

        return result;
    }

    private static int? FindHeaderRow(IXLWorksheet worksheet, int lastRow)
    {
        for (var r = 1; r <= Math.Min(lastRow, 10); r++)
        {
            if (worksheet.Row(r).CellsUsed().Count() >= 2) return r;
        }

        return null;
    }

    /// <summary>
    /// Lowercase, unaccented, trimmed. "Téléphone", "telephone" and " TÉLÉPHONE " are the same
    /// column: a file that has been through three people's hands is not going to match on the
    /// nose, and refusing it over an accent would be refusing it for nothing.
    /// </summary>
    public static string Normalise(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";

        var decomposed = value.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD);
        var builder = new System.Text.StringBuilder(decomposed.Length);

        foreach (var c in decomposed)
        {
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c)
                != System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                builder.Append(c);
            }
        }

        return builder.ToString().Normalize(System.Text.NormalizationForm.FormC);
    }

    /// <summary>Excel's own rules: 31 characters, and none of \ / ? * [ ] :</summary>
    private static string SheetName(string raw)
    {
        var cleaned = new string(raw.Where(c => !@"\/?*[]:".Contains(c)).ToArray()).Trim();
        return cleaned.Length <= 31 ? cleaned : cleaned[..31];
    }
}
