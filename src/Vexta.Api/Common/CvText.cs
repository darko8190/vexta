using System.Text;
using Vexta.Api.Domain;

namespace Vexta.Api.Common;

/// <summary>
/// A CV written out as plain text, which is what a company receives with an application.
///
/// Text rather than a structure copied into the company's space, because what the company needs
/// is to read it. A copy of the tables would mean the same CV stored once per application, with
/// nothing able to query across them and every one of them a second place to keep in step.
///
/// It renders a <see cref="CvModel"/>, which is also what the PDF renders, so the text a company
/// reads on screen and the document attached to the same application cannot disagree about what
/// was sent.
/// </summary>
public static class CvText
{
    public static string Build(
        string firstName,
        string lastName,
        string? email,
        PersonalProfile profile,
        string? coverNote) =>
        Build(CvModel.From(firstName, lastName, email, profile, coverNote));

    public static string Build(CvModel cv)
    {
        var lines = new StringBuilder();

        void Section(string title)
        {
            if (lines.Length > 0) lines.AppendLine();
            lines.AppendLine(title.ToUpperInvariant());
        }

        lines.AppendLine(cv.Name);
        if (cv.Headline is { } headline) lines.AppendLine(headline);
        if (cv.Contact.Count > 0) lines.AppendLine(string.Join(" · ", cv.Contact));
        if (cv.Availability is { } availability) lines.AppendLine(availability);

        if (cv.CoverNote is { } note)
        {
            Section(CvModel.MessageHeading);
            lines.AppendLine(note);
        }

        if (cv.Summary is { } summary)
        {
            Section(CvModel.SummaryHeading);
            lines.AppendLine(summary);
        }

        if (cv.Roles.Count > 0)
        {
            Section(CvModel.ExperienceHeading);
            foreach (var role in cv.Roles)
            {
                lines.AppendLine($"- {role.Heading}");
                if (role.Period is { } period) lines.AppendLine($"  {period}");
                if (role.Description is { } description) lines.AppendLine($"  {description}");
            }
        }

        if (cv.Studies.Count > 0)
        {
            Section(CvModel.EducationHeading);
            foreach (var study in cv.Studies)
            {
                var year = study.Year is { } completed ? $" ({completed})" : "";
                lines.AppendLine($"- {study.Heading}{year}");
                if (study.Notes is { } notes) lines.AppendLine($"  {notes}");
            }
        }

        if (cv.Skills.Count > 0)
        {
            Section(CvModel.SkillsHeading);
            foreach (var skill in cv.Skills)
            {
                lines.AppendLine($"- {skill}");
            }
        }

        var text = lines.ToString().TrimEnd();

        // The column is 8000; a CV past that has been pasted rather than written, and the cut is
        // marked so nobody reads a truncated job history as a complete one.
        return text.Length <= 8000 ? text : text[..7980].TrimEnd() + "\n[…]";
    }
}
