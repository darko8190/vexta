using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.ImportExport;

/// <summary>
/// Clients, with their contacts and their addresses on their own tabs.
///
/// The link between the tabs is the client's name, written in a "Client" column on each
/// sub-sheet. Not the internal id: a person building a list in Excel has no ids, and a format
/// only an export can produce is a format nobody can type.
/// </summary>
public class ClientWorkbook : IEntityWorkbook
{
    public string Slug => "clients";
    public string FileName => "clients";

    private const string Main = "Clients";
    private const string Contacts = "Contacts";
    private const string Addresses = "Adresses";

    private static readonly string[] MainColumns =
    [
        "Type", "Statut", "Entreprise", "Prénom", "Nom", "Courriel", "Téléphone",
        "Numéro de taxe", "Non taxable", "Notes",
        "Adresse", "Ville", "Province", "Code postal", "Pays",
    ];

    private static readonly string[] ContactColumns =
    [
        "Client", "Prénom", "Nom", "Rôle", "Courriel", "Téléphone", "Notes",
    ];

    private static readonly string[] AddressColumns =
    [
        "Client", "Type", "Principale", "Adresse", "Complément", "Ville", "Province",
        "Code postal", "Pays",
    ];

    public IReadOnlyList<WorkbookSheet> Template() =>
    [
        new(Main, MainColumns,
            [
                ["Entreprise", "Client", "Constructions Tremblay", "", "", "info@tremblay.ca",
                 "418 555-0142", "", "non", "", "120 rue Principale", "Lévis", "QC", "G6V 1A1", "Canada"],
                ["Particulier", "Prospect", "", "Marie", "Gagnon", "marie.gagnon@exemple.ca",
                 "581 555-0190", "", "non", "", "", "", "", "", ""],
            ],
            "Une ligne par client. Type : Particulier ou Entreprise. Pour une entreprise, remplissez « Entreprise » ; pour un particulier, « Prénom » et « Nom ». Ne changez pas les en-têtes."),
        new(Contacts, ContactColumns,
            [["Constructions Tremblay", "Luc", "Tremblay", "Contremaître", "luc@tremblay.ca", "418 555-0143", ""]],
            "La colonne « Client » doit reprendre exactement le nom écrit dans l'onglet Clients."),
        new(Addresses, AddressColumns,
            [["Constructions Tremblay", "Livraison", "non", "45 rue du Chantier", "", "Lévis", "QC", "G6V 2B2", "Canada"]],
            "Adresses supplémentaires. L'adresse principale se remplit directement dans l'onglet Clients."),
    ];

    public async Task<IReadOnlyList<WorkbookSheet>> ExportAsync(
        VextaDbContext db, Guid tenantId, CancellationToken ct)
    {
        var clients = await db.Clients.AsNoTracking()
            .Include(c => c.Addresses)
            .OrderBy(c => c.Number)
            .ToListAsync(ct);

        var contacts = await db.ClientContacts.AsNoTracking()
            .OrderBy(c => c.LastName).ThenBy(c => c.FirstName)
            .ToListAsync(ct);

        var byId = clients.ToDictionary(c => c.Id);

        var mainRows = clients.Select(c =>
        {
            var primary = c.Addresses.FirstOrDefault(a => a.IsPrimary) ?? c.Addresses.FirstOrDefault();
            return (IReadOnlyList<string?>)
            [
                c.Type.ToString(), c.Status.ToString(), c.CompanyName, c.FirstName, c.LastName,
                c.Email, c.Phone, c.TaxId, Cell.Yes(c.IsTaxExempt), c.Notes,
                primary?.Line1, primary?.City, primary?.Province, primary?.PostalCode, primary?.Country,
            ];
        }).ToList();

        var contactRows = contacts
            .Where(c => byId.ContainsKey(c.ClientId))
            .Select(c => (IReadOnlyList<string?>)
            [
                byId[c.ClientId].Name, c.FirstName, c.LastName, c.Role, c.Email, c.Phone, c.Notes,
            ])
            .ToList();

        // The primary address is already on the client's own row, so repeating it here would
        // make every round trip add a duplicate.
        var addressRows = clients
            .SelectMany(c => c.Addresses.Where(a => !a.IsPrimary).Select(a => (IReadOnlyList<string?>)
            [
                c.Name, a.Type.ToString(), Cell.Yes(a.IsPrimary), a.Line1, a.Line2,
                a.City, a.Province, a.PostalCode, a.Country,
            ]))
            .ToList();

        return
        [
            new(Main, MainColumns, mainRows),
            new(Contacts, ContactColumns, contactRows),
            new(Addresses, AddressColumns, addressRows),
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

        var existing = await db.Clients.Include(c => c.Addresses).ToListAsync(ct);
        var byName = existing
            .GroupBy(c => WorkbookService.Normalise(c.Name))
            .ToDictionary(g => g.Key, g => g.First());

        var number = existing.Count == 0 ? 0 : existing.Max(c => c.Number);

        foreach (var row in Rows(sheets, Main))
        {
            var type = Cell.Enum(row.Get("Type"), ClientType.Particulier);
            var company = Cell.Text(row.Get("Entreprise"));
            var first = Cell.Text(row.Get("Prénom"));
            var last = Cell.Text(row.Get("Nom"));

            var name = type == ClientType.Entreprise ? company : $"{first} {last}".Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                problems.Add($"{Main}, ligne {row.LineNumber} : il faut un nom d'entreprise ou un prénom et un nom.");
                skipped++;
                continue;
            }

            var key = WorkbookService.Normalise(name);
            if (!byName.TryGetValue(key, out var client))
            {
                client = new Client
                {
                    TenantId = tenantId,
                    Number = ++number,
                    Name = name,
                };
                db.Clients.Add(client);
                byName[key] = client;
                created++;
            }
            else
            {
                updated++;
            }

            client.Type = type;
            client.Status = Cell.Enum(row.Get("Statut"), ClientStatus.Client);
            client.Name = name;
            client.CompanyName = company;
            client.FirstName = first;
            client.LastName = last;
            client.Email = Cell.Text(row.Get("Courriel"));
            client.Phone = Cell.Text(row.Get("Téléphone"));
            client.TaxId = Cell.Text(row.Get("Numéro de taxe"));
            client.IsTaxExempt = Cell.Flag(row.Get("Non taxable"));
            client.Notes = Cell.Text(row.Get("Notes"));
            client.UpdatedAt = DateTimeOffset.UtcNow;

            if (Cell.Text(row.Get("Adresse")) is { } line1)
            {
                var primary = client.Addresses.FirstOrDefault(a => a.IsPrimary);
                if (primary is null)
                {
                    primary = new Address
                    {
                        TenantId = tenantId,
                        ClientId = client.Id,
                        IsPrimary = true,
                        Line1 = line1,
                        City = Cell.Text(row.Get("Ville")) ?? "",
                        PostalCode = Cell.Text(row.Get("Code postal")) ?? "",
                        Country = Cell.Text(row.Get("Pays")) ?? "Canada",
                    };

                    // Added to the DbSet, not only to the navigation. A new row reached through
                    // the collection of a client that already exists is marked Modified rather
                    // than Added — EF decides from the key, and this one carries a Guid of its
                    // own from the moment it is constructed. The save then UPDATEs a row that
                    // was never inserted, affects nothing, and throws. Added to the collection
                    // as well, so the next sheet finds it without going back to the database.
                    db.Addresses.Add(primary);
                    client.Addresses.Add(primary);
                }

                primary.Line1 = line1;
                primary.City = Cell.Text(row.Get("Ville")) ?? primary.City;
                primary.Province = Cell.Text(row.Get("Province"));
                primary.PostalCode = Cell.Text(row.Get("Code postal")) ?? primary.PostalCode;
                primary.Country = Cell.Text(row.Get("Pays")) ?? primary.Country;
                primary.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        // Saved before the sub-sheets so a brand new client has an id its contacts can hang off.
        await db.SaveChangesAsync(ct);

        foreach (var row in Rows(sheets, Contacts))
        {
            var owner = Find(byName, row.Get("Client"));
            if (owner is null)
            {
                problems.Add($"{Contacts}, ligne {row.LineNumber} : aucun client ne s'appelle « {row.Get("Client")} ».");
                skipped++;
                continue;
            }

            var first = Cell.Text(row.Get("Prénom"));
            var last = Cell.Text(row.Get("Nom"));
            if (first is null && last is null)
            {
                problems.Add($"{Contacts}, ligne {row.LineNumber} : il faut au moins un prénom ou un nom.");
                skipped++;
                continue;
            }

            var email = Cell.Text(row.Get("Courriel"));
            var contact = await db.ClientContacts.FirstOrDefaultAsync(
                c => c.ClientId == owner.Id
                     && (email != null ? c.Email == email : (c.FirstName == first && c.LastName == last)), ct);

            if (contact is null)
            {
                contact = new ClientContact
                {
                    TenantId = tenantId,
                    ClientId = owner.Id,
                    FirstName = first ?? "",
                    LastName = last ?? "",
                };
                db.ClientContacts.Add(contact);
                created++;
            }
            else
            {
                updated++;
            }

            contact.FirstName = first ?? contact.FirstName;
            contact.LastName = last ?? contact.LastName;
            contact.Role = Cell.Text(row.Get("Rôle"));
            contact.Email = email;
            contact.Phone = Cell.Text(row.Get("Téléphone"));
            contact.Notes = Cell.Text(row.Get("Notes"));
            contact.UpdatedAt = DateTimeOffset.UtcNow;
        }

        foreach (var row in Rows(sheets, Addresses))
        {
            var owner = Find(byName, row.Get("Client"));
            if (owner is null)
            {
                problems.Add($"{Addresses}, ligne {row.LineNumber} : aucun client ne s'appelle « {row.Get("Client")} ».");
                skipped++;
                continue;
            }

            var line1 = Cell.Text(row.Get("Adresse"));
            if (line1 is null)
            {
                problems.Add($"{Addresses}, ligne {row.LineNumber} : l'adresse est vide.");
                skipped++;
                continue;
            }

            var type = Cell.Enum(row.Get("Type"), AddressType.Livraison);
            var address = owner.Addresses.FirstOrDefault(
                a => a.Line1 == line1 && a.Type == type);

            if (address is null)
            {
                address = new Address
                {
                    TenantId = tenantId,
                    ClientId = owner.Id,
                    Type = type,
                    Line1 = line1,
                    City = Cell.Text(row.Get("Ville")) ?? "",
                    PostalCode = Cell.Text(row.Get("Code postal")) ?? "",
                    Country = Cell.Text(row.Get("Pays")) ?? "Canada",
                };
                db.Addresses.Add(address);
                owner.Addresses.Add(address);
                created++;
            }
            else
            {
                updated++;
            }

            address.Line2 = Cell.Text(row.Get("Complément"));
            address.City = Cell.Text(row.Get("Ville")) ?? address.City;
            address.Province = Cell.Text(row.Get("Province"));
            address.PostalCode = Cell.Text(row.Get("Code postal")) ?? address.PostalCode;
            address.Country = Cell.Text(row.Get("Pays")) ?? address.Country;
            address.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return new ImportReport(created, updated, skipped, problems);
    }

    private static Client? Find(Dictionary<string, Client> byName, string? name) =>
        name is not null && byName.TryGetValue(WorkbookService.Normalise(name), out var client) ? client : null;

    internal static IReadOnlyList<WorkbookRow> Rows(
        IReadOnlyDictionary<string, IReadOnlyList<WorkbookRow>> sheets, string name) =>
        sheets.TryGetValue(WorkbookService.Normalise(name), out var rows) ? rows : [];
}
