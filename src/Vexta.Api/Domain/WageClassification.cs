namespace Vexta.Api.Domain;

/// <summary>
/// A pay classification: "Commercial", "Résidentiel", "Industriel". A title, and the steps
/// under it that a worker climbs — Apprenti 1 to 4, then Compagnon.
///
/// This is how hours are priced in the trades here: the rate is not the person's but the
/// step's, set by the sector, and the same apprentice is paid differently on a commercial job
/// than on a residential one. So the classification belongs to the company's settings and is
/// chosen on the job, which is where the sector is decided.
/// </summary>
public class WageClassification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Name { get; set; }

    /// <summary>Where it sits in the list. The sectors have an order people expect.</summary>
    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<WageClassificationStep> Steps { get; set; } = [];
    public List<Project> Projects { get; set; } = [];
}

/// <summary>
/// One step of a classification, with its three hourly figures.
///
/// Three because they answer three different questions. The wage is what the worker is paid.
/// The cost is what that hour really costs the company once the charges on the wage are added
/// — the figure a job's real cost is built from. The selling rate is what the client is billed
/// for it. Keeping only two would have somebody computing the third by hand on every quote.
///
/// All three optional: a company may know what it bills an apprentice before it has worked out
/// what one costs, and refusing the row until then is how the table never gets filled in.
/// </summary>
public class WageClassificationStep
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid ClassificationId { get; set; }
    public WageClassification? Classification { get; set; }

    /// <summary>"Apprenti 1", "Compagnon".</summary>
    public required string Name { get; set; }

    /// <summary>Climbing order: the first apprentice step first, the journeyman last.</summary>
    public int SortOrder { get; set; }

    public decimal? Wage { get; set; }
    public decimal? Cost { get; set; }
    public decimal? Selling { get; set; }
}
