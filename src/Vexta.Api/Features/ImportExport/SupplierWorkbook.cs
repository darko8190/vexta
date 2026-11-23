using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.ImportExport;

/// <summary>
/// Fournisseurs. One sheet, because a supplier's sub-tabs are its orders and its deliveries,
/// and neither is a list anybody types into a spreadsheet — an order written by hand would have
/// no number, no lines and no stock movement behind it.
/// </summary>
public class SupplierWorkbook : IEntityWorkbook
{
    public string Slug => "fournisseurs";
    public string FileName => "fournisseurs";

    private const string Main = "Fournisseurs";

    private static readonly string[] Columns =
    [
        "Nom", "Contact", "Courriel", "Téléphone", "Site web", "Numéro de compte",
        "Adresse", "Ville", "Province", "Code postal", "Notes", "Actif",
    ];

    public IReadOnlyList<WorkbookSheet> Template() =>
    [
        new(Main, Columns,
            [
                ["Matériaux Bélanger", "Sophie Bélanger", "ventes@belanger.ca", "418 555-0120",
                 "https://belanger.ca", "CPT-4821", "900 boulevard Industriel", "Lévis", "QC",
                 "G6W 7R1", "", "oui"],
            ],
            "Une ligne par fournisseur. Le nom sert de clé : un nom déjà présent met le fournisseur à jour au lieu d'en créer un deuxième."),
    ];

    public async Task<IReadOnlyList<WorkbookSheet>> ExportAsync(
        VextaDbContext db, Guid tenantId, CancellationToken ct)
    {
        var suppliers = await db.Suppliers.AsNoTracking().OrderBy(s => s.Name).ToListAsync(ct);

        var rows = suppliers.Select(s => (IReadOnlyList<string?>)
        [
            s.Name, s.ContactName, s.Email, s.Phone, s.Website, s.AccountNumber,
            s.Line1, s.City, s.Province, s.PostalCode, s.Notes, Cell.Yes(s.IsActive),
        ]).ToList();

        return [new(Main, Columns, rows)];
    }

    public async Task<ImportReport> ImportAsync(
        VextaDbContext db,
        Guid tenantId,
        IReadOnlyDictionary<string, IReadOnlyList<WorkbookRow>> sheets,
        CancellationToken ct)
    {
        var problems = new List<string>();
        int created = 0, updated = 0, skipped = 0;

        var existing = await db.Suppliers.ToListAsync(ct);
        var byName = existing
            .GroupBy(s => WorkbookService.Normalise(s.Name))
            .ToDictionary(g => g.Key, g => g.First());

        foreach (var row in ClientWorkbook.Rows(sheets, Main))
        {
            var name = Cell.Text(row.Get("Nom"));
            if (name is null)
            {
                problems.Add($"{Main}, ligne {row.LineNumber} : le nom est obligatoire.");
                skipped++;
                continue;
            }

            var key = WorkbookService.Normalise(name);
            if (!byName.TryGetValue(key, out var supplier))
            {
                supplier = new Supplier { TenantId = tenantId, Name = name };
                db.Suppliers.Add(supplier);
                byName[key] = supplier;
                created++;
            }
            else
            {
                updated++;
            }

            supplier.Name = name;
            supplier.ContactName = Cell.Text(row.Get("Contact"));
            supplier.Email = Cell.Text(row.Get("Courriel"));
            supplier.Phone = Cell.Text(row.Get("Téléphone"));
            supplier.Website = Cell.Text(row.Get("Site web"));
            supplier.AccountNumber = Cell.Text(row.Get("Numéro de compte"));
            supplier.Line1 = Cell.Text(row.Get("Adresse"));
            supplier.City = Cell.Text(row.Get("Ville"));
            supplier.Province = Cell.Text(row.Get("Province"));
            supplier.PostalCode = Cell.Text(row.Get("Code postal"));
            supplier.Notes = Cell.Text(row.Get("Notes"));
            supplier.IsActive = Cell.Flag(row.Get("Actif"), fallback: true);
            supplier.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return new ImportReport(created, updated, skipped, problems);
    }
}
