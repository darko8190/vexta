using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Vexta.Api.Common;

/// <summary>
/// A CV as a document somebody can print, attach to an email or hand across a table.
///
/// It renders the same <see cref="CvModel"/> the plain text renders, which is the point: the
/// company reading an application on screen and the person holding the paper version of it are
/// looking at one CV, not at two things that have to be kept in step.
///
/// Set like a CV rather than like an invoice. No colour band, no logo, no brand: this document
/// belongs to the person, not to a company, and it is read by someone deciding whether to
/// telephone them. Letter paper, Montserrat, small letter-spaced headings over a hairline --
/// the plainest typography that still looks typeset, and it photocopies.
/// </summary>
public class CvDocument(CvModel cv) : IDocument
{
    private const string Ink = "#1A1A1A";
    private const string Grey = "#5F5F5F";
    private const string LightGrey = "#9E9E9E";
    private const string HairLine = "#D9D9D9";
    private const string Font = "Montserrat";

    public DocumentMetadata GetMetadata() => new()
    {
        Title = $"CV — {cv.Name}",
        Author = cv.Name
    };

    public void Compose(IDocumentContainer container) => container.Page(page =>
    {
        page.Size(PageSizes.Letter);
        page.Margin(46);
        page.PageColor(Colors.White);
        page.DefaultTextStyle(text => text.FontFamily(Font).FontSize(9).FontColor(Ink).LineHeight(1.35f));

        page.Content().Element(Body);

        // The name travels with the page number, which is what makes a second page that came
        // loose in a pile still obviously part of this CV.
        page.Footer().AlignCenter().Text(text =>
        {
            text.DefaultTextStyle(style => style.FontSize(7).FontColor(LightGrey));
            text.Span($"{cv.Name} · page ");
            text.CurrentPageNumber();
            text.Span(" de ");
            text.TotalPages();
        });
    });

    /// <summary>
    /// Who this is and how to reach them. Once, at the top, not repeated as a running header:
    /// a second page that opened with the whole block again would read as a second CV, and the
    /// footer already carries the name onto every page.
    /// </summary>
    private void Identity(IContainer container) => container.Column(column =>
    {
        column.Item().Text(cv.Name).FontSize(19).Bold();

        if (cv.Headline is { } headline)
        {
            column.Item().PaddingTop(1).Text(headline).FontSize(10).FontColor(Grey);
        }

        if (cv.Contact.Count > 0)
        {
            column.Item().PaddingTop(5).Text(string.Join("  ·  ", cv.Contact)).FontSize(8.5f).FontColor(Grey);
        }

        if (cv.Availability is { } availability)
        {
            column.Item().PaddingTop(1).Text(availability).FontSize(8.5f);
        }

        column.Item().PaddingTop(9).LineHorizontal(1).LineColor(Ink);
    });

    private void Body(IContainer container) => container.Column(column =>
    {
        column.Item().Element(Identity);

        if (cv.CoverNote is { } note)
        {
            Section(column, CvModel.MessageHeading);
            column.Item().Text(note);
        }

        if (cv.Summary is { } summary)
        {
            Section(column, CvModel.SummaryHeading);
            column.Item().Text(summary);
        }

        if (cv.Roles.Count > 0)
        {
            Section(column, CvModel.ExperienceHeading);

            foreach (var role in cv.Roles)
            {
                // Enough room reserved that an entry is never left as a heading alone at the
                // foot of a page. Not PreventPageBreak: a long description would then be
                // pushed whole onto the next page and leave half a page blank.
                column.Item().EnsureSpace(46).PaddingBottom(9).Column(entry =>
                {
                    entry.Item().Element(c => Line(c, role.Heading, role.Period));

                    if (role.Description is { } description)
                    {
                        entry.Item().PaddingTop(2).Text(description).FontSize(8.5f).FontColor(Grey);
                    }
                });
            }
        }

        if (cv.Studies.Count > 0)
        {
            Section(column, CvModel.EducationHeading);

            foreach (var study in cv.Studies)
            {
                column.Item().EnsureSpace(30).PaddingBottom(7).Column(entry =>
                {
                    entry.Item().Element(c => Line(c, study.Heading, study.Year));

                    if (study.Notes is { } notes)
                    {
                        entry.Item().PaddingTop(2).Text(notes).FontSize(8.5f).FontColor(Grey);
                    }
                });
            }
        }

        if (cv.Skills.Count > 0)
        {
            Section(column, CvModel.SkillsHeading);
            column.Item().Element(Skills);
        }
    });

    /// <summary>
    /// A heading in small letter-spaced capitals over a hairline, with room reserved so the
    /// heading cannot end up as the last thing on a page with its section on the next one.
    /// </summary>
    private static void Section(ColumnDescriptor column, string title) =>
        column.Item().EnsureSpace(58).PaddingTop(13).PaddingBottom(6).Column(heading =>
        {
            heading.Item().Text(title.ToUpperInvariant())
                .FontSize(7.5f).Bold().LetterSpacing(0.12f).FontColor(Grey);

            heading.Item().PaddingTop(3).LineHorizontal(0.5f).LineColor(HairLine);
        });

    /// <summary>
    /// A heading with its date against the right margin — the shape every CV uses, because the
    /// reader scans the left edge for what somebody did and the right edge for when.
    /// </summary>
    private static void Line(IContainer container, string heading, string? aside) => container.Row(row =>
    {
        row.RelativeItem().Text(heading).FontSize(9.5f).Bold();

        if (aside is { } value)
        {
            row.ConstantItem(12);
            // Wide enough for "septembre 2019 – aujourd'hui" on one line: a date that wraps
            // reads as two dates.
            row.ConstantItem(140).AlignRight().Text(value).FontSize(8.5f).FontColor(Grey);
        }
    });

    /// <summary>
    /// The tickets, in two columns. They are short -- "ASP Construction", "Classe 3" -- and a
    /// single column of fifteen of them wastes two thirds of the page on a CV that is fighting
    /// for its second page.
    /// </summary>
    private void Skills(IContainer container) => container.Row(row =>
    {
        var half = (cv.Skills.Count + 1) / 2;

        row.RelativeItem().Element(c => Bullets(c, cv.Skills.Take(half)));
        row.ConstantItem(18);
        row.RelativeItem().Element(c => Bullets(c, cv.Skills.Skip(half)));
    });

    private static void Bullets(IContainer container, IEnumerable<string> items) => container.Column(column =>
    {
        foreach (var item in items)
        {
            column.Item().PaddingBottom(1).Row(line =>
            {
                line.ConstantItem(10).Text("•").FontColor(Grey);
                line.RelativeItem().Text(item);
            });
        }
    });
}
