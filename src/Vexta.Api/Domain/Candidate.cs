namespace Vexta.Api.Domain;

/// <summary>Where somebody is in the hiring.</summary>
public enum CandidateStatus
{
    Nouveau = 0,
    Entrevue = 1,
    Offre = 2,

    /// <summary>Hired. The employee record made from them is on <see cref="Candidate.EmployeeId"/>.</summary>
    Embauche = 3,

    Refuse = 4,

    /// <summary>They withdrew, or stopped answering.</summary>
    Retire = 5
}

/// <summary>
/// Somebody who applied. Not an employee — a name, a trade and a phone number, kept until
/// either they are hired or the season ends.
///
/// Separate from <see cref="Employee"/> on purpose, even though hiring one copies most of the
/// fields across: an employee row is what the payroll, the seat count and the timesheets hang
/// off, and a pile of applicants sitting in it would be counted as staff by every one of them.
/// </summary>
public class Candidate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }

    public string? Email { get; set; }
    public string? Phone { get; set; }

    /// <summary>
    /// The posting they answered, when they answered one. Null for a CV that arrived on its own
    /// — which is most of them in a trade, and a posting invented to hold such a candidate would
    /// inflate the only number a posting is judged on.
    /// </summary>
    public Guid? JobPostingId { get; set; }
    public JobPosting? JobPosting { get; set; }

    /// <summary>The job they are after — "Charpentier", "Journalier", "Chargé de projet".</summary>
    public string? DesiredJobTitle { get; set; }

    /// <summary>Where they came from — "Indeed", "Référé par Marc", "Page publique".</summary>
    public string? Source { get; set; }

    public CandidateStatus Status { get; set; } = CandidateStatus.Nouveau;

    public DateOnly AppliedOn { get; set; }

    /// <summary>Their résumé, as uploaded. Null when they applied by phone.</summary>
    public Guid? ResumeMediaAssetId { get; set; }
    public MediaAsset? ResumeMediaAsset { get; set; }

    /// <summary>
    /// The Vexta account that applied, for an application made from a public page. Null for
    /// everybody else -- a CV that arrived by email, somebody entered by hand.
    ///
    /// Kept so the same person cannot file four applications on one posting, and so they can be
    /// shown what they have applied to. Deliberately not a way for the company to read their
    /// profile: what the company has is this card, copied at the moment they applied.
    /// </summary>
    public Guid? ApplicantUserId { get; set; }

    /// <summary>The company's own notes on them. Never written by anything but the company.</summary>
    public string? Notes { get; set; }

    /// <summary>
    /// The CV as the applicant sent it, frozen at the moment they applied.
    ///
    /// Its own column rather than <see cref="Notes"/>, which belongs to the company: an
    /// application and an opinion about it are two different things, and writing the first into
    /// the second would overwrite whatever the office had already typed.
    ///
    /// A snapshot and not a link to the person's profile, for the same reason the whole card is
    /// a copy: they will edit their CV next month, and what this company received must not
    /// change under it afterwards.
    /// </summary>
    public string? ApplicationSummary { get; set; }

    /// <summary>
    /// The employee created when they were hired. Set once, and what stops the same person
    /// being hired twice from the same card.
    /// </summary>
    public Guid? EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public string FullName => $"{FirstName} {LastName}".Trim();
}
