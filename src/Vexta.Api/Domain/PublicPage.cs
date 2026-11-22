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

/// <summary>A position the company is hiring for, shown on its public page.</summary>
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

    /// <summary>A filled position stays on file and comes off the page.</summary>
    public bool IsPublished { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
