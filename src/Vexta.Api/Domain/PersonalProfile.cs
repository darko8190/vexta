namespace Vexta.Api.Domain;

/// <summary>
/// What somebody with a personal account says about themselves: the curriculum vitae behind an
/// application.
///
/// Keyed by the user and carrying no tenant, which makes it the one record in the application
/// that belongs to a person rather than to a company. That is deliberate and it is the whole
/// point: a tradesperson applies to three companies in a season, and a CV stored inside a
/// company's space would have to be retyped for each of them and would disappear with any one
/// of them. There is no query filter for the same reason -- there is no tenant to filter on --
/// so every query here names the user explicitly.
///
/// Applying never hands a company this row. It makes a <see cref="Candidate"/> in that company's
/// own space, copied from here, exactly as an application that arrived by email would. The
/// company then owns what it received, and the person can change or delete their own CV
/// afterwards without rewriting history inside somebody else's business.
/// </summary>
public class PersonalProfile
{
    /// <summary>One profile per account, so the account's id is the key.</summary>
    public Guid UserId { get; set; }
    public ApplicationUser? User { get; set; }

    /// <summary>
    /// Required to apply. A company that cannot telephone an applicant will not chase them by
    /// email, and the trades run on the telephone.
    /// </summary>
    public string? Phone { get; set; }

    /// <summary>The one line under the name: "Charpentier-menuisier, 12 ans d'expérience".</summary>
    public string? Headline { get; set; }

    /// <summary>A paragraph in their own words. Optional, and usually the best thing on a CV.</summary>
    public string? Summary { get; set; }

    // ---- Where they are, which is half of whether a posting is realistic ----

    public string? City { get; set; }
    public string? Province { get; set; }
    public string? Country { get; set; }

    /// <summary>When they could start. Null for "right away", which is what most people mean.</summary>
    public DateOnly? AvailableFrom { get; set; }

    /// <summary>
    /// Tickets and licences, one per line: "ASP Construction", "Classe 3", "Nacelle". One column
    /// rather than a table because nothing is ever queried on these -- they are read by a person
    /// deciding whether to call, and a table would buy a join and nothing else.
    /// </summary>
    public string? Skills { get; set; }

    /// <summary>
    /// A CV the person uploaded themselves, when they would rather send their own document than
    /// fill in the fields. Either this or one experience is enough to count as a CV; see
    /// <see cref="IsComplete"/>.
    /// </summary>
    public Guid? ResumeMediaAssetId { get; set; }
    public MediaAsset? ResumeMediaAsset { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<PersonalExperience> Experiences { get; set; } = [];
    public List<PersonalEducation> Education { get; set; } = [];

    /// <summary>
    /// Whether this is enough of a CV to apply with.
    ///
    /// Two things, and no more: a telephone number, and some account of what they have done --
    /// either one job written down or a document they uploaded. Asking for more would turn a
    /// job application into a form-filling exercise and cost the company the applicants it most
    /// wants; asking for less would send a company a name and nothing to act on.
    ///
    /// Computed here rather than stored, so it can never be stale, and read by both the screen
    /// that nags and the endpoint that refuses.
    /// </summary>
    public bool IsComplete =>
        !string.IsNullOrWhiteSpace(Phone)
        && (Experiences.Count > 0 || ResumeMediaAssetId is not null);
}

/// <summary>One job somebody has held.</summary>
public class PersonalExperience
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public PersonalProfile? Profile { get; set; }

    /// <summary>What they did there — "Charpentier", "Chef d'équipe".</summary>
    public required string Title { get; set; }

    public string? Employer { get; set; }
    public string? Location { get; set; }

    public DateOnly? StartedOn { get; set; }

    /// <summary>Null means they are still there, which is what a blank end date means on a CV.</summary>
    public DateOnly? EndedOn { get; set; }

    public string? Description { get; set; }

    public int SortOrder { get; set; }
}

/// <summary>One thing somebody studied.</summary>
public class PersonalEducation
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public PersonalProfile? Profile { get; set; }

    /// <summary>"DEP Charpenterie-menuiserie", "AEC Estimation".</summary>
    public required string Program { get; set; }

    public string? School { get; set; }

    /// <summary>The year it finished. A year rather than a date: nobody remembers the day.</summary>
    public int? CompletedYear { get; set; }

    public string? Notes { get; set; }

    public int SortOrder { get; set; }
}
