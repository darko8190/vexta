using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.ImportExport;

/// <summary>
/// Produits, with the two lists a product points at on their own tabs.
///
/// Categories are created on the fly from whatever the Produits sheet names, so a supplier's
/// price list can be pasted in without anybody having to set up the categories first. The two
/// extra tabs are there to rename or reorganise them deliberately, and to carry categories that
/// have no product in them yet.
/// </summary>
public class ProductWorkbook : IEntityWorkbook
{
    public string Slug => "produits";
    public string FileName => "produits";

    private const string Main = "Produits";
    private const string Categories = "Catégories";
    private const string SubCategories = "Sous-catégories";

    private static readonly string[] MainColumns =
    [
        "Code", "Titre", "Description", "Unité", "Catégorie", "Sous-catégorie", "Code-barres",
        "Suivi d'inventaire", "Quantité minimum", "Quantité maximum",
        "Prix d'achat", "Marge %", "Prix de vente", "Minutes d'installation", "Public", "Note",
    ];

    private static readonly string[] CategoryColumns = ["Catégorie"];
    private static readonly string[] SubCategoryColumns = ["Catégorie", "Sous-catégorie"];

    public IReadOnlyList<WorkbookSheet> Template() =>
    [
        new(Main, MainColumns,
            [
                ["GYP-12", "Gypse 1/2 po 4x8", "Panneau régulier", "feuille", "Matériaux", "Gypse",
                 "0628451002", "oui", "20", "200", "14.75", "25", "18.50", "15", "non", ""],
                ["MO-INST", "Main-d'œuvre installation", "", "h", "Main-d'œuvre", "", "",
                 "non", "", "", "", "", "85.00", "", "non", ""],
            ],
            "Une ligne par produit. Le code sert de clé ; sans code, c'est le titre. « Suivi d'inventaire » à non pour ce qui se vend à l'heure ou au mètre."),
        new(Categories, CategoryColumns, [["Matériaux"], ["Main-d'œuvre"]],
            "Les catégories citées dans l'onglet Produits sont créées automatiquement ; cet onglet sert à en ajouter d'avance."),
        new(SubCategories, SubCategoryColumns, [["Matériaux", "Gypse"], ["Matériaux", "Isolation"]],
            "La colonne « Catégorie » doit exister dans l'onglet Catégories ou dans l'onglet Produits."),
    ];

    public async Task<IReadOnlyList<WorkbookSheet>> ExportAsync(
        VextaDbContext db, Guid tenantId, CancellationToken ct)
    {
        var products = await db.Products.AsNoTracking()
            .Include(p => p.Category)
            .Include(p => p.SubCategory)
            .OrderBy(p => p.Number)
            .ToListAsync(ct);

        var categories = await db.ProductCategories.AsNoTracking()
            .Include(c => c.SubCategories)
            .OrderBy(c => c.Name)
            .ToListAsync(ct);

        var rows = products.Select(p => (IReadOnlyList<string?>)
        [
            p.Code, p.Title, p.Description, p.Unit, p.Category?.Name, p.SubCategory?.Name, p.Barcode,
            Cell.Yes(p.TracksInventory), Cell.Money(p.MinimumQuantity), Cell.Money(p.MaximumQuantity),
            Cell.Money(p.PurchasePrice), Cell.Money(p.MarginPercent), Cell.Money(p.SellingPrice),
            p.InstallationMinutes?.ToString(), Cell.Yes(p.IsPublic), p.Note,
        ]).ToList();

        return
        [
            new(Main, MainColumns, rows),
            new(Categories, CategoryColumns,
                categories.Select(c => (IReadOnlyList<string?>)[c.Name]).ToList()),
            new(SubCategories, SubCategoryColumns,
                categories.SelectMany(c => c.SubCategories
                        .OrderBy(s => s.Name)
                        .Select(s => (IReadOnlyList<string?>)[c.Name, s.Name]))
                    .ToList()),
        ];
    }

    public async Task<ImportReport> ImportAsync(
        VextaDbContext db,
        Guid tenantId,
        IReadOnlyDictionary<string, IReadOnlyList<WorkbookRow>> sheets,
        CancellationToken ct)
    {
        var problems = new List<string>();
        int created = 0, updated = 0, skipped = 0;

        var categories = await db.ProductCategories.Include(c => c.SubCategories).ToListAsync(ct);
        var byCategory = categories
            .GroupBy(c => WorkbookService.Normalise(c.Name))
            .ToDictionary(g => g.Key, g => g.First());

        ProductCategory Category(string name)
        {
            var key = WorkbookService.Normalise(name);
            if (byCategory.TryGetValue(key, out var found)) return found;

            var category = new ProductCategory { TenantId = tenantId, Name = name.Trim() };
            db.ProductCategories.Add(category);
            byCategory[key] = category;
            return category;
        }

        ProductSubCategory SubCategory(ProductCategory parent, string name)
        {
            var key = WorkbookService.Normalise(name);
            var found = parent.SubCategories.FirstOrDefault(s => WorkbookService.Normalise(s.Name) == key);
            if (found is not null) return found;

            var sub = new ProductSubCategory { TenantId = tenantId, CategoryId = parent.Id, Name = name.Trim() };

            // Added to the DbSet, not only to the navigation: a row reached through the
            // collection of a category that already exists would be marked Modified rather than
            // Added, because it already carries a key, and the save would UPDATE a row that was
            // never inserted. Added to the collection too, so the next lookup in this same run
            // finds it.
            db.ProductSubCategories.Add(sub);
            parent.SubCategories.Add(sub);
            return sub;
        }

        foreach (var row in ClientWorkbook.Rows(sheets, Categories))
        {
            if (Cell.Text(row.Get("Catégorie")) is { } name) Category(name);
        }

        foreach (var row in ClientWorkbook.Rows(sheets, SubCategories))
        {
            var parent = Cell.Text(row.Get("Catégorie"));
            var child = Cell.Text(row.Get("Sous-catégorie"));
            if (parent is null || child is null)
            {
                problems.Add($"{SubCategories}, ligne {row.LineNumber} : il faut une catégorie et une sous-catégorie.");
                skipped++;
                continue;
            }

            SubCategory(Category(parent), child);
        }

        var products = await db.Products.ToListAsync(ct);
        var byCode = products
            .Where(p => !string.IsNullOrWhiteSpace(p.Code))
            .GroupBy(p => WorkbookService.Normalise(p.Code))
            .ToDictionary(g => g.Key, g => g.First());
        var byTitle = products
            .GroupBy(p => WorkbookService.Normalise(p.Title))
            .ToDictionary(g => g.Key, g => g.First());

        var number = products.Count == 0 ? 0 : products.Max(p => p.Number);

        foreach (var row in ClientWorkbook.Rows(sheets, Main))
        {
            var title = Cell.Text(row.Get("Titre"));
            if (title is null)
            {
                problems.Add($"{Main}, ligne {row.LineNumber} : le titre est obligatoire.");
                skipped++;
                continue;
            }

            var code = Cell.Text(row.Get("Code"));

            // The code wins when there is one: two products may share a title, and a supplier's
            // list is keyed on the code the counter clerk reads out.
            var product = code is not null && byCode.TryGetValue(WorkbookService.Normalise(code), out var byItsCode)
                ? byItsCode
                : byTitle.GetValueOrDefault(WorkbookService.Normalise(title));

            if (product is null)
            {
                product = new Product { TenantId = tenantId, Number = ++number, Title = title };
                db.Products.Add(product);
                if (code is not null) byCode[WorkbookService.Normalise(code)] = product;
                byTitle[WorkbookService.Normalise(title)] = product;
                created++;
            }
            else
            {
                updated++;
            }

            product.Title = title;
            product.Code = code;
            product.Description = Cell.Text(row.Get("Description"));
            product.Unit = Cell.Text(row.Get("Unité"));
            product.Barcode = Cell.Text(row.Get("Code-barres"));
            product.TracksInventory = Cell.Flag(row.Get("Suivi d'inventaire"), fallback: true);
            product.MinimumQuantity = Cell.Amount(row.Get("Quantité minimum"));
            product.MaximumQuantity = Cell.Amount(row.Get("Quantité maximum"));
            product.PurchasePrice = Cell.Amount(row.Get("Prix d'achat"));
            product.MarginPercent = Cell.Amount(row.Get("Marge %"));
            product.SellingPrice = Cell.Amount(row.Get("Prix de vente"));
            product.InstallationMinutes = Cell.Count(row.Get("Minutes d'installation"));
            product.IsPublic = Cell.Flag(row.Get("Public"));
            product.Note = Cell.Text(row.Get("Note"));
            product.UpdatedAt = DateTimeOffset.UtcNow;

            if (Cell.Text(row.Get("Catégorie")) is { } categoryName)
            {
                var category = Category(categoryName);
                product.Category = category;
                product.CategoryId = category.Id;

                if (Cell.Text(row.Get("Sous-catégorie")) is { } subName)
                {
                    var sub = SubCategory(category, subName);
                    product.SubCategory = sub;
                    product.SubCategoryId = sub.Id;
                }
                else
                {
                    product.SubCategory = null;
                    product.SubCategoryId = null;
                }
            }

            // The quantity on hand is deliberately not importable: it is moved by stock entries,
            // which are what a count or a delivery leaves behind. Typing over it in a spreadsheet
            // would make the number disagree with the history that explains it.
        }

        await db.SaveChangesAsync(ct);
        return new ImportReport(created, updated, skipped, problems);
    }
}
