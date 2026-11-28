using Microsoft.EntityFrameworkCore;
using Vexta.Api.Domain;

namespace Vexta.Api.Data.Seed;

/// <summary>
/// Puts the catalogue a company is sold from on the shelf: one module per tab the application
/// actually has, and the two features it sells by use.
///
/// This exists because of a trap the module-driven sidebar sets. A company's menu is built from
/// the modules on its plan, and the built-in menu is only a fallback for a plan that defines
/// none at all. Tick one module on a plan and every tab that has no module of its own vanishes
/// — so an administrator who adds "Clients" silently takes away Rapports, Achats and the rest.
/// The only way out was to type twelve modules by hand and get every route right.
///
/// So they are seeded instead. The administrator's job is reduced to ticking what a plan
/// includes, which is the decision they actually wanted to make.
/// </summary>
public static class CatalogSeeder
{
    /// <param name="Href">Matched against the existing rows: this is what makes the seed safe to re-run.</param>
    private record BuiltInModule(
        string Href, string Title, string Description, string Icon, bool OwnerOnly = false);

    /// <summary>
    /// The tabs, in the order they belong in a menu. Mirrors tenantNav in the web app's
    /// nav-config.ts — the two lists are the same menu seen from two sides, and a tab added
    /// there without a row here is a tab that disappears the moment a plan defines a module.
    /// </summary>
    private static readonly BuiltInModule[] Modules =
    [
        new("/mes-feuilles-de-temps", "Mes feuilles de temps",
            "Chaque employé saisit ses heures et les soumet.", "CalendarClock"),
        new("/mes-assignations", "Mes assignations",
            "Les tâches et les projets assignés à la personne qui regarde.", "ListChecks"),
        new("/clients", "Clients",
            "Les clients, leurs contacts, leurs adresses, leurs actifs et leur compte.", "Users"),
        new("/projets", "Projets",
            "Les projets, leurs tâches, leur main-d'œuvre, leurs matériaux et leurs documents.", "FolderKanban"),
        new("/soumissions", "Soumissions",
            "Les prix donnés aux clients, et ce qu'ils sont devenus.", "ClipboardPen"),
        new("/factures", "Facturation",
            "Les factures, les paiements reçus et ce qui reste dû.", "FileText"),
        new("/achats", "Achats",
            "Les dépenses faites sur les projets, avec leurs reçus.", "ShoppingCart"),
        new("/approvisionnement", "Fournisseurs & Commandes",
            "Les fournisseurs, les bons de commande et les réceptions de marchandise.", "Truck"),
        new("/inventaire", "Inventaire",
            "Les produits, leurs prix, leurs catégories et ce qui est en stock.", "Boxes"),
        // What is waiting for the office: the customers' orders and the projects nobody has
        // been handed yet. The route kept its old name so hidden tabs and plans still match.
        new("/commandes", "À traiter",
            "Les commandes des clients et les projets qui attendent une équipe.", "Inbox"),
        new("/outils", "Outils",
            "Les formulaires de l'entreprise, leurs réponses et la page publique.", "ClipboardPen"),
        new("/temps", "Feuilles de temps et poinçons",
            "Les heures de toute l'équipe, toutes les feuilles ensemble.", "Clock"),
        new("/taches-horaire", "Tâches et horaire",
            "Qui est attendu où, et ce qu'il reste à faire sur les chantiers.", "CalendarClock"),
        new("/rapports", "Rapports",
            "Les chiffres de l'entreprise, regroupés par thème.", "ChartBar"),
        new("/ressources-humaines", "Ressources humaines",
            "Les employés et leur dossier : salaires, congés, horaires, formations.", "UsersRound",
            OwnerOnly: true),
        new("/entreprise", "Entreprise",
            "La fiche de l'entreprise, ses lieux et son image de marque.", "Building2",
            OwnerOnly: true),
    ];

    private record BuiltInFeature(string Key, string Name, string Description, string Icon);

    private static readonly BuiltInFeature[] Features =
    [
        new(FeatureKeys.Ocr, "Lecture de reçus (OCR)",
            "Photographier un reçu et laisser un modèle en lire le fournisseur, la date et les montants. Le nombre de lectures par mois se règle sur le forfait.",
            "Receipt"),
        new(FeatureKeys.Ai, "Assistant IA",
            "Un bouton dans la barre du haut qui ouvre une conversation avec l'assistant. L'entreprise branche sa propre clé Claude ou ChatGPT.",
            "Sparkles"),
        new(FeatureKeys.Payments, "Paiements en ligne",
            "L'entreprise branche son propre compte Stripe et se fait payer par carte : un lien de paiement sur les factures qu'elle envoie, et la caisse de sa page publique. L'argent va dans son compte, pas dans celui de Vexta.",
            "CreditCard"),
        new(FeatureKeys.Mcp, "Clé MCP",
            "Des clés qui permettent à un assistant externe (Claude, ChatGPT, une automatisation) de lire et de travailler dans les données de l'entreprise.",
            "KeyRound"),
        new(FeatureKeys.PayPal, "Paiements PayPal",
            "L'entreprise branche son propre compte PayPal Business et ses clients peuvent payer leurs factures avec PayPal. L'argent va dans son compte.",
            "Wallet"),
    ];

    public static async Task SeedAsync(IServiceProvider services, ILogger logger)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();

        await SeedModulesAsync(db, logger);
        await SeedFeaturesAsync(db, logger);
        await SeedReportsAsync(db, logger);
    }

    private static async Task SeedModulesAsync(VextaDbContext db, ILogger logger)
    {
        // Matched on the route rather than on the title: the title is the administrator's to
        // change, the route is the application's. Renaming "Facturation" must not conjure a
        // second module pointing at the same screen.
        var existing = await db.Modules
            .Where(m => m.NavHref != null)
            .Select(m => m.NavHref!)
            .ToListAsync();

        var known = existing.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var missing = Modules.Where(m => !known.Contains(m.Href)).ToList();
        if (missing.Count == 0) return;

        // Appended after whatever is already there instead of inserted at their natural
        // position: an administrator who has dragged the menu into the order they want should
        // not find it rearranged by a deploy. The rows are theirs to move afterwards.
        var nextSortOrder = await db.Modules.AnyAsync()
            ? await db.Modules.MaxAsync(m => m.SortOrder) + 1
            : 0;

        foreach (var item in missing)
        {
            db.Modules.Add(new Module
            {
                Icon = item.Icon,
                Title = item.Title,
                Description = item.Description,
                NavHref = item.Href,
                OwnerOnly = item.OwnerOnly,
                SortOrder = nextSortOrder++,
                IsPublished = true
            });
        }

        await db.SaveChangesAsync();
        logger.LogInformation(
            "{Count} module(s) manquant(s) ajouté(s) au catalogue : {Routes}",
            missing.Count, string.Join(", ", missing.Select(m => m.Href)));
    }

    private record BuiltInReport(string Key, string ModuleHref, string Title, string Description, string Icon);

    /// <summary>
    /// The reports every company starts with, each under the module that sells it. Matched on
    /// the key: a report the super admin renamed, moved or unpublished stays as they left it,
    /// and one they deleted on purpose comes back only if its key is gone — a deploy adds the
    /// new ones and touches nothing else.
    /// </summary>
    private static readonly BuiltInReport[] Reports =
    [
        // Ventes et facturation
        new(ReportKeys.SalesByMonth, "/factures", "Ventes par mois", "Facturé par mois, avant et après taxes, et ce qui a été encaissé.", "TrendingUp"),
        new(ReportKeys.SalesByClient, "/factures", "Ventes par client", "Ce que chaque client a été facturé sur la période, payé et dû.", "Users"),
        new(ReportKeys.SalesByProduct, "/factures", "Ventes par produit", "Quantités vendues, vendant, coût et marge par produit.", "Package"),
        new(ReportKeys.UnpaidInvoices, "/factures", "Factures impayées", "Les factures à payer aujourd'hui et leur retard.", "FileText"),
        new(ReportKeys.PaymentsReceived, "/factures", "Paiements reçus", "Chaque paiement reçu sur la période, par mode.", "Wallet"),
        new(ReportKeys.ClientBalances, "/factures", "Soldes des clients", "Ce que chaque client doit aujourd'hui, par âge. Les états de compte s'envoient depuis la fiche du client.", "HandCoins"),
        // Inventaire
        new(ReportKeys.InventoryValue, "/inventaire", "Valeur de l'inventaire", "Le stock au prix d'achat et au prix de vente.", "Boxes"),
        new(ReportKeys.InventoryBelowMinimum, "/inventaire", "Produits sous le minimum", "Ce qui est sous le minimum, et combien commander.", "PackageCheck"),
        // Achats
        new(ReportKeys.ExpensesByType, "/achats", "Dépenses par type", "Les dépenses de projets par type, au coût et refacturées.", "Receipt"),
        new(ReportKeys.PurchasesBySupplier, "/approvisionnement", "Achats par fournisseur", "Les commandes fournisseurs de la période par fournisseur.", "Truck"),
        // Production
        new(ReportKeys.ProjectProfitability, "/projets", "Rentabilité par projet", "Coût, vendant, bénéfice et facturé de chaque projet de la période.", "ChartBar"),
        new(ReportKeys.ProjectPipeline, "/projets", "Projets par statut", "Combien de projets sont à faire, commencés, à facturer ou facturés.", "FolderKanban"),
        new(ReportKeys.CompletedTasks, "/taches-horaire", "Tâches terminées", "Les tâches terminées par employé ou équipe, estimé contre réel.", "ListChecks"),
        new(ReportKeys.TaskLoad, "/taches-horaire", "Charge de tâches", "Les tâches de chacun par état, et celles en retard.", "ClipboardList"),
        // Feuilles de temps et main-d'œuvre
        new(ReportKeys.HoursByEmployee, "/temps", "Heures par employé", "Les heures de chaque employé sur la période.", "Clock"),
        new(ReportKeys.HoursByProject, "/temps", "Heures par projet", "Les heures entrées sur chaque projet.", "CalendarClock"),
        new(ReportKeys.LabourByEmployee, "/temps", "Main-d'œuvre par employé", "Heures, taux moyen et main-d'œuvre facturable de chaque employé.", "UsersRound"),
        new(ReportKeys.LabourByProject, "/temps", "Main-d'œuvre par projet", "Heures, taux moyen et main-d'œuvre facturable de chaque projet.", "Wrench"),
    ];

    private static async Task SeedReportsAsync(VextaDbContext db, ILogger logger)
    {
        var known = (await db.Reports.Select(r => r.Key).ToListAsync()).ToHashSet(StringComparer.Ordinal);
        var missing = Reports.Where(r => !known.Contains(r.Key)).ToList();
        if (missing.Count == 0) return;

        var modules = await db.Modules
            .Where(m => m.NavHref != null)
            .Select(m => new { m.Id, m.NavHref })
            .ToListAsync();
        var byHref = modules
            .GroupBy(m => m.NavHref!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Id, StringComparer.OrdinalIgnoreCase);

        var added = new List<string>();
        var order = 0;
        foreach (var item in Reports)
        {
            order++;
            if (known.Contains(item.Key) || !byHref.TryGetValue(item.ModuleHref, out var moduleId)) continue;
            db.Reports.Add(new Report
            {
                Key = item.Key,
                ModuleId = moduleId,
                Title = item.Title,
                Description = item.Description,
                Icon = item.Icon,
                SortOrder = order,
                IsPublished = true
            });
            added.Add(item.Key);
        }

        if (added.Count == 0) return;
        await db.SaveChangesAsync();
        logger.LogInformation("{Count} rapport(s) ajouté(s) : {Keys}", added.Count, string.Join(", ", added));
    }

    private static async Task SeedFeaturesAsync(VextaDbContext db, ILogger logger)
    {
        var known = await db.Features.Select(f => f.Key).ToListAsync();
        var missing = Features.Where(f => !known.Contains(f.Key)).ToList();
        if (missing.Count == 0) return;

        var sortOrder = known.Count;
        foreach (var item in missing)
        {
            db.Features.Add(new Feature
            {
                Key = item.Key,
                Name = item.Name,
                Description = item.Description,
                Icon = item.Icon,
                SortOrder = sortOrder++,
                IsPublished = true,
                IsBuiltIn = true
            });
        }

        await db.SaveChangesAsync();
        logger.LogInformation(
            "{Count} fonctionnalité(s) ajoutée(s) : {Keys}",
            missing.Count, string.Join(", ", missing.Select(f => f.Key)));

        await BackfillOcrAsync(db, missing, logger);
    }

    /// <summary>
    /// Ticks OCR on the plans that were already paying for it.
    ///
    /// Before features existed, a plan's receipt allowance was the switch: more than zero meant
    /// the company had it. Introducing a feature nobody has ticked would have turned the thing
    /// off for every plan that sold it, so the first time the row appears it inherits the answer
    /// the allowance was already giving. Runs once, because it only runs for a feature that was
    /// missing a moment ago.
    /// </summary>
    private static async Task BackfillOcrAsync(VextaDbContext db, List<BuiltInFeature> justAdded, ILogger logger)
    {
        if (justAdded.All(f => f.Key != FeatureKeys.Ocr)) return;

        var ocr = await db.Features.FirstOrDefaultAsync(f => f.Key == FeatureKeys.Ocr);
        if (ocr is null) return;

        var plans = await db.Plans
            .Include(p => p.Features)
            .Where(p => p.MonthlyReceiptScans > 0)
            .ToListAsync();

        if (plans.Count == 0) return;

        foreach (var plan in plans.Where(p => p.Features.All(f => f.Id != ocr.Id)))
        {
            plan.Features.Add(ocr);
        }

        await db.SaveChangesAsync();
        logger.LogInformation(
            "Lecture de reçus activée sur {Count} forfait(s) qui avaient déjà une allocation.", plans.Count);
    }
}
