namespace Vexta.Api.Domain;

/// <summary>
/// The company's own page on Vexta, at /e/{slug}.
///
/// It is off until someone turns it on. A company that has not written a word should not have a
/// public address with its name on it and nothing underneath, and a page that exists the moment
/// an account does is a page nobody chose to publish.
/// </summary>
public class PublicPage
{
    /// <summary>One page per company, so the tenant's id is the key.</summary>
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public bool IsPublished { get; set; }

    /// <summary>The line across the top. Falls back to the company's name when empty.</summary>
    public string? Headline { get; set; }

    /// <summary>A paragraph or two: what the company does and who it does it for.</summary>
    public string? About { get; set; }

    /// <summary>What a visitor should do — telephone, email, a form later on.</summary>
    public string? ContactNote { get; set; }

    /// <summary>Each section can be hidden without emptying it.</summary>
    public bool ShowProducts { get; set; } = true;
    public bool ShowJobs { get; set; } = true;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Where a posting stands. Pourvue and Fermee are kept apart on purpose: a position that was
/// filled and one that was pulled are both "no longer open", and a company that cannot tell
/// them apart cannot say afterwards whether its advertising worked.
/// </summary>
public enum JobPostingStatus
{
    /// <summary>Written, not advertised yet.</summary>
    Brouillon = 0,

    /// <summary>Out, and on the public page.</summary>
    Publiee = 1,

    /// <summary>Somebody was hired for it.</summary>
    Pourvue = 2,

    /// <summary>Taken down without hiring.</summary>
    Fermee = 3
}

/// <summary>
/// A position the company is hiring for: the advertisement on its public page and the hiring
/// file behind it, in one row.
///
/// One row for both because they are one thing. A second table for "the hiring side" would mean
/// a posting could say Pourvue in Ressources humaines and still be advertising on the web, and
/// nobody would find out from either screen.
/// </summary>
public class JobPosting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Title { get; set; }
    public string? Description { get; set; }

    /// <summary>Where the work is. Free text: "Québec et environs" is an answer.</summary>
    public string? Location { get; set; }

    public EmploymentType EmploymentType { get; set; } = EmploymentType.TempsPlein;

    /// <summary>What it pays, as the company wants to say it: "28 à 34 $/h", "à discuter".</summary>
    public string? Compensation { get; set; }

    /// <summary>Where to apply. An address, a telephone number, a link.</summary>
    public string? ApplyTo { get; set; }

    /// <summary>
    /// How many people are wanted. One by default, because that is the usual answer and a
    /// posting for zero people is not a posting.
    /// </summary>
    public int Openings { get; set; } = 1;

    public JobPostingStatus Status { get; set; } = JobPostingStatus.Publiee;

    /// <summary>
    /// When it went out. Null while it is a draft — a date here would claim the position was
    /// advertised on a day nobody could see it.
    /// </summary>
    public DateOnly? PostedOn { get; set; }

    /// <summary>The closing date, when there is one. Null means open until it is filled.</summary>
    public DateOnly? ClosesOn { get; set; }

    /// <summary>The company's own notes. Never shown on the public page.</summary>
    public string? Notes { get; set; }

    /// <summary>
    /// Whether it appears on the public page. Mirrored from <see cref="Status"/> rather than set
    /// on its own: the visitor's query filters on this column, and two switches for "is this
    /// advertised" is how a filled position goes on collecting applications.
    /// </summary>
    public bool IsPublished { get; set; } = true;

    /// <summary>
    /// Who applied to it. Kept when the posting is deleted — see the SetNull on the other end:
    /// tidying up last season's advertisements must not erase the people who answered them.
    /// </summary>
    public List<Candidate> Candidates { get; set; } = [];

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
