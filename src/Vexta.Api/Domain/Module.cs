namespace Vexta.Api.Domain;

/// <summary>
/// A capability shown on the public site, checked off on the plans that include it, and — when
/// it carries a <see cref="NavHref"/> — an entry in the sidebar of every company whose plan
/// includes it. One row is both what is sold and what is opened, so the two cannot drift.
///
/// A module with no NavHref is marketing only: something a plan includes that has no screen of
/// its own, like "soutien téléphonique".
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

    /// <summary>
    /// The route this module opens, such as /clients. Null for a module that sells something
    /// without a screen behind it.
    /// </summary>
    public string? NavHref { get; set; }

    /// <summary>
    /// The module this one sits under in the sidebar. One level deep on purpose: a sidebar that
    /// nests further stops being something you can scan.
    /// </summary>
    public Guid? ParentModuleId { get; set; }
    public Module? ParentModule { get; set; }
    public List<Module> Children { get; set; } = [];

    /// <summary>
    /// Shown only to the owner of the company. Human resources and the company's own card are
    /// not an employee's to open, and an entry that answers 403 is worse than no entry.
    /// </summary>
    public bool OwnerOnly { get; set; }

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
        "Settings", "Lock", "Cloud", "Smartphone", "Truck", "Wrench",
        "Building2", "UsersRound", "Boxes", "Package", "Warehouse", "Layers", "ClipboardList",
        // The tabs added after the first batch of modules. Without these a company could not
        // give Achats a basket or Outils a mortarboard, and would have to settle for a cog.
        "ShoppingCart", "GraduationCap", "ClipboardPen", "ListChecks", "CalendarClock",
        "FolderOpen", "Wallet", "HandCoins", "UserPlus", "BookUser", "PackageCheck"
    };

    public static bool IsAllowed(string? icon) => icon is not null && Allowed.Contains(icon);
}
