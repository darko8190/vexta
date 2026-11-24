using System.Globalization;
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
/// It is also the content a PDF renders, so the two cannot disagree about what was sent.
/// </summary>
public static class CvText
{
    public static string Build(
        string firstName,
        string lastName,
        string? email,
        PersonalProfile profile,
        string? coverNote)
    {
        var lines = new StringBuilder();

        void Section(string title)
        {
            if (lines.Length > 0) lines.AppendLine();
            lines.AppendLine(title.ToUpperInvariant());
        }

        lines.AppendLine($"{firstName} {lastName}".Trim());
        if (!string.IsNullOrWhiteSpace(profile.Headline)) lines.AppendLine(profile.Headline);

        var contact = new[] { email, profile.Phone, Place(profile) }
            .Where(part => !string.IsNullOrWhiteSpace(part));
        if (contact.Any()) lines.AppendLine(string.Join(" · ", contact));

        if (profile.AvailableFrom is { } from)
        {
            lines.AppendLine($"Disponible à partir du {from.ToString("d MMMM yyyy", Culture)}");
        }

        if (!string.IsNullOrWhiteSpace(coverNote))
        {
            Section("Message");
            lines.AppendLine(coverNote.Trim());
        }

        if (!string.IsNullOrWhiteSpace(profile.Summary))
        {
            Section("Profil");
            lines.AppendLine(profile.Summary.Trim());
        }

        if (profile.Experiences.Count > 0)
        {
            Section("Expérience");
            foreach (var experience in profile.Experiences.OrderBy(x => x.SortOrder))
            {
                var heading = new[] { experience.Title, experience.Employer, experience.Location }
                    .Where(part => !string.IsNullOrWhiteSpace(part));

                lines.AppendLine($"- {string.Join(" — ", heading)}");

                if (Period(experience.StartedOn, experience.EndedOn) is { } period)
                {
                    lines.AppendLine($"  {period}");
                }

                if (!string.IsNullOrWhiteSpace(experience.Description))
                {
                    lines.AppendLine($"  {experience.Description.Trim()}");
                }
            }
        }

        if (profile.Education.Count > 0)
        {
            Section("Formation");
            foreach (var education in profile.Education.OrderBy(x => x.SortOrder))
            {
                var heading = new[] { education.Program, education.School }
                    .Where(part => !string.IsNullOrWhiteSpace(part));

                var year = education.CompletedYear is { } completed ? $" ({completed})" : "";
                lines.AppendLine($"- {string.Join(" — ", heading)}{year}");

                if (!string.IsNullOrWhiteSpace(education.Notes))
                {
                    lines.AppendLine($"  {education.Notes.Trim()}");
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(profile.Skills))
        {
            Section("Cartes et compétences");
            foreach (var skill in profile.Skills.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                lines.AppendLine($"- {skill}");
            }
        }

        var text = lines.ToString().TrimEnd();

        // The column is 8000; a CV past that has been pasted rather than written, and the cut is
        // marked so nobody reads a truncated job history as a complete one.
        return text.Length <= 8000 ? text : text[..7980].TrimEnd() + "\n[…]";
    }

    private static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("fr-CA");

    private static string? Place(PersonalProfile profile)
    {
        var parts = new[] { profile.City, profile.Province }
            .Where(part => !string.IsNullOrWhiteSpace(part));

        return parts.Any() ? string.Join(", ", parts) : null;
    }

    /// <summary>
    /// "mars 2019 – aujourd'hui" or "2019 – 2024". A missing end date means still there, which
    /// is what a blank end date means on every CV ever written.
    /// </summary>
    private static string? Period(DateOnly? from, DateOnly? to)
    {
        if (from is null && to is null) return null;

        var start = from?.ToString("MMMM yyyy", Culture) ?? "?";
        var end = to?.ToString("MMMM yyyy", Culture) ?? "aujourd'hui";

        return $"{start} – {end}";
    }
}
