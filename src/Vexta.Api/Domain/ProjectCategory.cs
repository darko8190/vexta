namespace Vexta.Api.Domain;

/// <summary>
/// One of the company's own ways of filing its jobs: "Résidentiel", "Commercial", "Service".
/// Added from the dropdown on the project form, like a product category: nobody visits a
/// settings screen to invent a category before they can save the job in front of them.
///
/// Its own table rather than the products' categories. A company files its catalogue by trade
/// ("Plomberie", "Électricité") and its jobs by kind of client or kind of work, and one shared
/// list would offer "Cuivre" as a kind of job.
/// </summary>
public class ProjectCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public required string Name { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ProjectSubCategory> SubCategories { get; set; } = [];
    public List<Project> Projects { get; set; } = [];
}

/// <summary>
/// A sub-category, under one category, so the second dropdown can be narrowed by the first.
/// </summary>
public class ProjectSubCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid CategoryId { get; set; }
    public ProjectCategory? Category { get; set; }

    public required string Name { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Project> Projects { get; set; } = [];
}
