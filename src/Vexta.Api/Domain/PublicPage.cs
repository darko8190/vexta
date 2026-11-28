namespace Vexta.Api.Domain;

/// <summary>
/// How the company's public page looks.
///
/// Four arrangements of the same content, not a theme editor. Every one of them derives its
/// colour from the company's own brand colour and its spacing from the application's scale, so
/// whichever is picked the page stays legible -- which is the whole reason the choice is a short
/// list rather than a stylesheet. A company that can produce an unreadable page will, and it is
/// its name on the result.
///
/// Stored as numbers, so new arrangements are appended.
/// </summary>
public enum PublicPageStyle
{
    /// <summary>What every page looked like before there was a choice.</summary>
    Classique = 0,

    /// <summary>Heavier: a dark masthead, wider measure, uppercase headings. Reads as a trade.</summary>
    Chantier = 1,

    /// <summary>Narrow, quiet, no rules or frames. For a page that is mostly words.</summary>
    Epure = 2,

    /// <summary>Products first and larger, the text secondary. For a page that is a catalogue.</summary>
    Vitrine = 3,

    /// <summary>
    /// Editorial: a wide measure, generous leading, headings reduced to small labels. For a
    /// company whose page is an argument rather than a list.
    /// </summary>
    Journal = 4,

    /// <summary>Everything in framed panels with a little lift. Reads as a product sheet.</summary>
    Panneau = 5,

    /// <summary>
    /// A poster. One column, the name very large and centred, nothing competing with it. For a
    /// trade whose page exists to be the name and a telephone number.
    /// </summary>
    Affiche = 6
}

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

    /// <summary>
    /// The forms the company ticked for its page. Off by default, unlike the other two: a
    /// company that has built forms for its crew has not thereby offered them to the internet,
    /// and the switch that changes that is one somebody has to reach for.
    /// </summary>
    public bool ShowForms { get; set; }

    /// <summary>
    /// Whether visitors may order the products on the page rather than only look at them.
    ///
    /// Off by default and separate from <see cref="ShowProducts"/>, because they are different
    /// promises. A shop window says "this is what we carry"; a basket says "ask us for it and we
    /// will get it to you", and a company that has not decided it can keep stock, answer the
    /// telephone and deliver should not be making that promise by accident.
    /// </summary>
    public bool AcceptsOrders { get; set; }

    /// <summary>
    /// Whether an order has to be paid by card before it counts as placed.
    ///
    /// A third switch rather than a setting on the second, because it is a third promise. "We
    /// carry this", "ask us and we will get it to you" and "pay us now and it is yours" are
    /// three different conversations, and a company that wants the first two does not thereby
    /// want the third.
    ///
    /// When it is on, payment is required and not merely offered. A switch that only offered it
    /// would make two kinds of order out of one basket, and the company would spend its week
    /// chasing the half that did not pay -- which is worse than either answer taken whole.
    ///
    /// It can only be turned on while the company's own Stripe account can take charges, and
    /// the shop closes if that stops being true. Falling back to unpaid orders would hand a
    /// company exactly the thing it switched this on to avoid.
    /// </summary>
    public bool RequiresOnlinePayment { get; set; }

    public PublicPageStyle Style { get; set; } = PublicPageStyle.Classique;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A file hung on a posting: the job description as a PDF, a photograph of the site, the
/// collective agreement.
///
/// Its own row rather than a column on the posting, because the point of the request was more
/// than one. The bytes live in the shared bucket like every other upload; this is only the
/// link, plus the order they were put in.
/// </summary>
public class JobPostingDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid JobPostingId { get; set; }
    public JobPosting? JobPosting { get; set; }

    public Guid MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    /// <summary>What to call it on the page. Falls back to the uploaded file's own name.</summary>
    public string? Label { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
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

    /// <summary>The group the posting is listed under on the public page: Chantier, Bureau.</summary>
    public string? Category { get; set; }

    /// <summary>Where to apply. An address, a telephone number, a link.</summary>
    public string? ApplyTo { get; set; }

    /// <summary>
    /// The form somebody fills to apply, when the company built one. Null means the posting
    /// says where to write and nothing more, which is how every posting worked before this.
    ///
    /// A reference to a form the company already owns rather than a set of questions on the
    /// posting: a company hiring two carpenters and a driver asks the same things each time,
    /// and a form per posting would be the same questions retyped and then edited in only one
    /// of three places.
    /// </summary>
    public Guid? FormTemplateId { get; set; }
    public FormTemplate? FormTemplate { get; set; }

    public List<JobPostingDocument> Documents { get; set; } = [];

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
