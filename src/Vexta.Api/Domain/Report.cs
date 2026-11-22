namespace Vexta.Api.Domain;

/// <summary>
/// One report offered on the Rapports page.
///
/// Every report hangs off a <see cref="Module"/>, and that is what decides who sees it: a
/// company whose plan does not include Inventaire is not offered the inventory reports. So the
/// list a company sees follows from what it bought, with nothing to keep in step by hand.
///
/// <see cref="Key"/> names the calculation in the API. The row is the offer — its title, its
/// place in the list, whether it is published — and the key is what that offer runs. The super
/// admin can rename and reorder freely; a key with no calculation behind it is refused when the
/// row is saved rather than discovered as a blank page.
/// </summary>
public class Report
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// The module this report belongs to. Restrict on delete: a module still carrying reports is
    /// untied from them deliberately, not emptied as a side effect of tidying the sidebar.
    /// </summary>
    public Guid ModuleId { get; set; }
    public Module? Module { get; set; }

    /// <summary>A value from <see cref="ReportKeys"/>.</summary>
    public required string Key { get; set; }

    public required string Title { get; set; }
    public required string Description { get; set; }

    /// <summary>A name from <see cref="ModuleIcons"/>, drawn by the web app.</summary>
    public required string Icon { get; set; }

    public int SortOrder { get; set; }
    public bool IsPublished { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// The calculations the API knows how to run. Adding a report means adding a key here and the
/// query behind it; the super admin then decides what it is called and which module sells it.
/// </summary>
public static class ReportKeys
{
    /// <summary>Per project: billed, cost, and what is left.</summary>
    public const string ProjectProfitability = "projets.rentabilite";

    /// <summary>Per project and per status: how many jobs sit where.</summary>
    public const string ProjectPipeline = "projets.pipeline";

    /// <summary>Hours logged per employee over a period.</summary>
    public const string HoursByEmployee = "rh.heures-par-employe";

    /// <summary>Tasks per employee and per team, and how many are late.</summary>
    public const string TaskLoad = "projets.charge-taches";

    /// <summary>Invoices sent and not paid, by age.</summary>
    public const string UnpaidInvoices = "factures.impayees";

    /// <summary>Sales per month: billed, taxes, collected.</summary>
    public const string SalesByMonth = "factures.ventes-par-mois";

    /// <summary>Stock on hand valued at purchase price.</summary>
    public const string InventoryValue = "inventaire.valeur";

    /// <summary>Expenses per project and per type.</summary>
    public const string ExpensesByType = "projets.depenses-par-type";

    public static readonly IReadOnlySet<string> Allowed = new HashSet<string>(StringComparer.Ordinal)
    {
        ProjectProfitability, ProjectPipeline, HoursByEmployee, TaskLoad,
        UnpaidInvoices, SalesByMonth, InventoryValue, ExpensesByType
    };

    public static bool IsAllowed(string? key) => key is not null && Allowed.Contains(key);
}
