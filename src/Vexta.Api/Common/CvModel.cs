using System.Globalization;
using Vexta.Api.Domain;

namespace Vexta.Api.Common;

/// <summary>
/// A CV reduced to what any rendering of it needs: the headings in order, the dates already
/// written out, nothing left to decide.
///
/// It exists so there is one answer to "what does this CV say". The plain text a company
/// receives with an application (<see cref="CvText"/>) and the document the person downloads
/// (<c>CvDocument</c>) are two renderings of this one record, which is the only way the two can
/// be promised not to disagree -- and they are read side by side, by the same two people, about
/// the same job.
///
/// Dates are strings here on purpose. "mars 2019 – aujourd'hui" is a decision about how a CV
/// reads, not about how a date is stored, and making it twice is how the text and the paper
/// start saying different things.
/// </summary>
public record CvModel(
    string Name,
    string? Headline,
    IReadOnlyList<string> Contact,
    string? Availability,
    string? CoverNote,
    string? Summary,
    IReadOnlyList<CvRole> Roles,
    IReadOnlyList<CvStudy> Studies,
    IReadOnlyList<string> Skills)
{
    // The section titles, shared rather than typed twice. The text rendering upper-cases them;
    // the document sets them in small type above a rule. Same words either way.
    public const string MessageHeading = "Message";
    public const string SummaryHeading = "Profil";
    public const string ExperienceHeading = "Expérience";
    public const string EducationHeading = "Formation";
    public const string SkillsHeading = "Cartes et compétences";

    private static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("fr-CA");

    public static CvModel From(
        string firstName,
        string lastName,
        string? email,
        PersonalProfile profile,
        string? coverNote) => new(
        Name: $"{firstName} {lastName}".Trim(),
        Headline: Clean(profile.Headline),
        Contact: new[] { email, profile.Phone, Place(profile) }
            .Select(Clean)
            .OfType<string>()
            .ToList(),
        Availability: profile.AvailableFrom is { } from
            ? $"Disponible à partir du {from.ToString("d MMMM yyyy", Culture)}"
            : null,
        CoverNote: Clean(coverNote),
        Summary: Clean(profile.Summary),
        Roles: profile.Experiences.OrderBy(x => x.SortOrder).Select(experience => new CvRole(
            Heading: Join(experience.Title, experience.Employer, experience.Location),
            Period: Period(experience.StartedOn, experience.EndedOn),
            Description: Clean(experience.Description))).ToList(),
        Studies: profile.Education.OrderBy(x => x.SortOrder).Select(education => new CvStudy(
            Heading: Join(education.Program, education.School),
            Year: education.CompletedYear?.ToString(CultureInfo.InvariantCulture),
            Notes: Clean(education.Notes))).ToList(),
        Skills: (profile.Skills ?? "")
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList());

    /// <summary>Whether there is anything here beyond a name, which is all a blank account has.</summary>
    public bool HasContent =>
        Headline is not null
        || Summary is not null
        || Roles.Count > 0
        || Studies.Count > 0
        || Skills.Count > 0;

    private static string? Place(PersonalProfile profile)
    {
        var parts = new[] { profile.City, profile.Province }
            .Where(part => !string.IsNullOrWhiteSpace(part));

        return parts.Any() ? string.Join(", ", parts) : null;
    }

    /// <summary>
    /// "Charpentier — Construction Tremblay — Québec", skipping what was left blank. An em dash
    /// between parts of one heading, which is how a CV reads them: one job, several facts.
    /// </summary>
    private static string Join(params string?[] parts) =>
        string.Join(" — ", parts.Where(part => !string.IsNullOrWhiteSpace(part)).Select(part => part!.Trim()));

    /// <summary>
    /// "mars 2019 – aujourd'hui" or "mars 2019 – juin 2024". A missing end date means still
    /// there, which is what a blank end date means on every CV ever written.
    /// </summary>
    private static string? Period(DateOnly? from, DateOnly? to)
    {
        if (from is null && to is null) return null;

        var start = from?.ToString("MMMM yyyy", Culture) ?? "?";
        var end = to?.ToString("MMMM yyyy", Culture) ?? "aujourd'hui";

        return $"{start} – {end}";
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>One job somebody has held, written out.</summary>
public record CvRole(string Heading, string? Period, string? Description);

/// <summary>One thing somebody studied, written out.</summary>
public record CvStudy(string Heading, string? Year, string? Notes);
