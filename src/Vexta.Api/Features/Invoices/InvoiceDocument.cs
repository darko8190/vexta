using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// The invoice as it is printed, signed and filed. Letter paper, 40 pt margins, Montserrat at
/// 9 pt — the same shape as the paper invoices this replaces, because a document people have
/// been reading for years should not have to be relearned.
///
/// The taxes sit at the bottom beside the total rather than on every line: that is where a
/// Québec invoice carries them, and it is where the person paying looks for them.
/// </summary>
public class InvoiceDocument(InvoicePdfModel model) : IDocument
{
    /// <summary>Vexta's blue, used by every company that has not chosen its own.</summary>
    private const string DefaultBlue = "#0982CE";

    /// <summary>
    /// The company's colour, or the default. Read once here rather than at each of the fifteen
    /// places below that paint something with it.
    /// </summary>
    private readonly string Blue = Normalize(model.BrandColor) ?? DefaultBlue;
    private const string Grey = "#757575";
    private const string PageNumberGrey = "#9E9E9E";
    private const string HairLine = "#E0E0E0";
    private const string Font = "Montserrat";

    /// <summary>
    /// #RRGGBB or nothing. The value comes from a database column, and QuestPDF hands colours
    /// straight to Skia, so anything else is refused here rather than thrown deep in the
    /// renderer while a person waits for an invoice.
    /// </summary>
    private static string? Normalize(string? hex)
    {
        if (string.IsNullOrWhiteSpace(hex)) return null;

        var value = hex.Trim();
        if (value.Length != 7 || value[0] != '#') return null;

        return value[1..].All(Uri.IsHexDigit) ? value.ToUpperInvariant() : null;
    }

    /// <summary>
    /// fr-CA with the thin spaces taken out. ICU groups thousands with U+202F, which Montserrat
    /// has no glyph for — the amount would print with a hole in it on the one document where a
    /// number has to be unambiguous.
    /// </summary>
    private static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("fr-CA");

    public DocumentMetadata GetMetadata() => new()
    {
        Title = $"{model.Wording.Name} {model.Number}",
        Author = model.CompanyName
    };

    public void Compose(IDocumentContainer container) => container.Page(page =>
    {
        page.Size(PageSizes.Letter);
        page.Margin(40);
        page.PageColor(Colors.White);
        page.DefaultTextStyle(text => text.FontFamily(Font).FontSize(9).FontColor(Colors.Black).LineHeight(1.25f));

        page.Header().Element(Header);
        page.Content().PaddingTop(12).Element(Body);

        page.Footer().AlignCenter().Text(text =>
        {
            text.DefaultTextStyle(style => style.FontSize(7).FontColor(PageNumberGrey));
            text.Span("Page ");
            text.CurrentPageNumber();
            text.Span(" de ");
            text.TotalPages();
        });
    });

    private void Header(IContainer container) => container.Column(column =>
    {
        column.Item().Row(row =>
        {
            if (model.Logo is { Length: > 0 } logo)
            {
                row.ConstantItem(72).Height(72).AlignLeft().AlignMiddle().Image(logo).FitArea();
                row.ConstantItem(18);
            }

            row.RelativeItem().AlignMiddle().Column(info =>
            {
                info.Item().Text(model.CompanyName).Bold();
                foreach (var line in model.CompanyLines)
                {
                    info.Item().Text(line);
                }
            });

            row.ConstantItem(180).Column(right =>
            {
                right.Item().AlignRight().Text(model.Wording.Title).FontSize(18).Bold().FontColor(Blue);
                right.Item().AlignRight().Text($"No: {model.Number}");
                right.Item().AlignRight().Text($"Date: {model.IssueDate:yyyy-MM-dd}");
                if (model.DueDate is { } due)
                {
                    right.Item().AlignRight().Text($"{model.Wording.DueLabel}: {due:yyyy-MM-dd}");
                }

                if (model.ProjectLabel is { Length: > 0 } project)
                {
                    right.Item().AlignRight().Text($"Projet: {project}");
                }

                if (model.PoNumber is { Length: > 0 } po)
                {
                    right.Item().AlignRight().Text($"Bon de commande: {po}");
                }
            });
        });

        column.Item().PaddingTop(10).LineHorizontal(1).LineColor(Blue);
    });

    private void Body(IContainer container) => container.Column(column =>
    {
        column.Item().Row(row =>
        {
            row.RelativeItem().Column(bill =>
            {
                bill.Item().Text(model.Wording.BillToLabel).Bold().FontColor(Blue);
                bill.Item().Text(model.BillTo.Name);

                foreach (var line in model.BillTo.Lines)
                {
                    bill.Item().Text(line);
                }

                if (model.BillTo.Email is { Length: > 0 } email)
                {
                    bill.Item().Text(email);
                }
            });

            row.ConstantItem(24);

            row.RelativeItem().Column(site =>
            {
                if (model.SiteAddress.Count == 0) return;

                site.Item().Text("Adresse des travaux:").Bold().FontColor(Blue);
                foreach (var line in model.SiteAddress)
                {
                    site.Item().Text(line);
                }
            });
        });

        if (model.Notes is { Length: > 0 } notes)
        {
            column.Item().PaddingTop(12).Text(notes).FontSize(10);
        }

        column.Item().PaddingTop(14).Text("Détail des travaux compris").Bold().FontColor(Blue);
        column.Item().PaddingTop(6).Element(LinesTable);
        column.Item().PaddingTop(18).Element(Totals);
        column.Item().PaddingTop(24).Element(Reception);
    });

    private void LinesTable(IContainer container) => container.Table(table =>
    {
        table.ColumnsDefinition(columns =>
        {
            columns.RelativeColumn();
            columns.ConstantColumn(60);
            columns.ConstantColumn(85);
            columns.ConstantColumn(90);
        });

        // Repeated on every page: a second page of lines whose columns are unlabelled is a
        // column of numbers nobody can read.
        table.Header(header =>
        {
            header.Cell().Element(HeaderCell).Text("Description");
            header.Cell().Element(HeaderCell).AlignRight().Text("Qté");
            header.Cell().Element(HeaderCell).AlignRight().Text("Prix");
            header.Cell().Element(HeaderCell).AlignRight().Text("Montant");
        });

        foreach (var line in model.Lines)
        {
            table.Cell().Element(BodyCell).Text(line.Description);
            table.Cell().Element(BodyCell).AlignRight().Text(Number(line.Quantity));
            table.Cell().Element(BodyCell).AlignRight().Text(Money(line.UnitPrice));
            table.Cell().Element(BodyCell).AlignRight().Text(Money(line.Amount));
        }

        // Not static: the band's colour is the company's, which is an instance field now.
        IContainer HeaderCell(IContainer cell) => cell
            .Background(Blue)
            .PaddingVertical(5)
            .PaddingHorizontal(4)
            .DefaultTextStyle(text => text.Bold().FontColor(Colors.White));

        static IContainer BodyCell(IContainer cell) => cell
            .BorderBottom(0.5f)
            .BorderColor(HairLine)
            .PaddingVertical(5)
            .PaddingHorizontal(4);
    });

    private void Totals(IContainer container) => container.Row(row =>
    {
        row.RelativeItem();

        // Wide enough for "TVQ (9.975 %) #1234567890 TQ0001:" on one line. A registration
        // number that wraps turns the one block people check into something to decipher.
        row.ConstantItem(300).Column(totals =>
        {
            totals.Item().Element(c => Line(c, "Sous-total:", Money(model.Subtotal)));

            foreach (var tax in model.Taxes)
            {
                totals.Item().Element(c => Line(c, $"{tax.Label}:", Money(tax.Amount)));
            }

            totals.Item().PaddingTop(6).LineHorizontal(1).LineColor(Colors.Black);

            totals.Item().PaddingTop(4).Row(total =>
            {
                total.RelativeItem().Text("TOTAL:").FontSize(11).Bold().FontColor(Blue);
                total.ConstantItem(110).AlignRight().Text(Money(model.Total)).FontSize(11).Bold().FontColor(Blue);
            });
        });

        static void Line(IContainer container, string label, string amount) => container.Row(line =>
        {
            line.RelativeItem().Text(label);
            line.ConstantItem(95).AlignRight().Text(amount);
        });
    });

    /// <summary>
    /// The part that makes the paper worth keeping: a line the client signs to say the work was
    /// received. The company's own conditions print above it, because that is what is being
    /// agreed to.
    /// </summary>
    private void Reception(IContainer container) => container.Column(column =>
    {
        if (model.Terms is { Length: > 0 } terms)
        {
            column.Item().PaddingBottom(10).Text(terms).FontSize(8).FontColor(Grey);
        }

        column.Item().Text(model.Wording.SignatureHeading).Bold().FontColor(Blue);

        column.Item().PaddingTop(8).Text(
                model.Wording.SignatureText)
            .FontSize(8).FontColor(Grey);

        // Signed online: the typed name sits on the line where the pen would go, the date beside
        // it, and a sentence under both says how it was given.
        var signed = model.Signature;

        column.Item().PaddingTop(signed is null ? 28 : 14).Row(row =>
        {
            row.RelativeItem(3).Column(signature =>
            {
                if (signed is not null)
                    signature.Item().PaddingBottom(2).Text(signed.Name).FontSize(13).Italic().FontColor(Blue);
                signature.Item().LineHorizontal(0.5f).LineColor(Grey);
                signature.Item().PaddingTop(4).Text($"Signature — {model.BillTo.Name}").FontSize(8).FontColor(Grey);
            });

            row.ConstantItem(24);

            row.RelativeItem(1).Column(date =>
            {
                if (signed is not null)
                    date.Item().PaddingBottom(2).Text(signed.Date).FontSize(10);
                date.Item().LineHorizontal(0.5f).LineColor(Grey);
                date.Item().PaddingTop(4).Text("Date").FontSize(8).FontColor(Grey);
            });
        });

        if (signed is not null)
        {
            column.Item().PaddingTop(6).Text(signed.Statement).FontSize(8).FontColor(Grey);
        }

        if (model.FooterNote is { Length: > 0 } footer)
        {
            column.Item().PaddingTop(14).Text(footer).FontSize(8).FontColor(Grey);
        }
    });

    private string Money(decimal amount)
    {
        var formatted = amount.ToString("N2", Culture).Replace(' ', ' ').Replace(' ', ' ');
        return model.Currency.Equals("CAD", StringComparison.OrdinalIgnoreCase)
            ? $"{formatted} $"
            : $"{formatted} {model.Currency.ToUpperInvariant()}";
    }

    private static string Number(decimal value) =>
        value.ToString("0.##", Culture).Replace(' ', ' ').Replace(' ', ' ');
}
