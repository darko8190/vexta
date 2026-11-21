namespace Vexta.Api.Domain;

/// <summary>
/// A capability shown on the public site and checked off on the plans that include it. It is
/// marketing content: nothing in the application is opened or closed by a module.
/// </summary>
public class Module
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>A name from <see cref="ModuleIcons"/>, resolved to a Lucide icon by the web app.</summary>
    public required string Icon { get; set; }

    public required string Title { get; set; }
    public required string Description { get; set; }

    public int SortOrder { get; set; }
    public bool IsPublished { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Plan> Plans { get; set; } = [];
}

/// <summary>
/// The icons the web app knows how to draw. Validated here so a typo cannot reach the public
/// site as a blank square.
/// </summary>
public static class ModuleIcons
{
    public static readonly IReadOnlySet<string> Allowed = new HashSet<string>(StringComparer.Ordinal)
    {
        "Users", "MapPin", "FolderKanban", "FileText", "LayoutDashboard", "ShieldCheck",
        "Images", "HardDrive", "CreditCard", "Receipt", "Calendar", "Clock",
        "Mail", "Phone", "Bell", "Search", "ChartBar", "TrendingUp",
        "Settings", "Lock", "Cloud", "Smartphone", "Truck", "Wrench"
    };

    public static bool IsAllowed(string? icon) => icon is not null && Allowed.Contains(icon);
}
