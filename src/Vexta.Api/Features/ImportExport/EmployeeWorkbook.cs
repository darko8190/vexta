using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.ImportExport;

/// <summary>
/// Employés, with three of their file's tabs: emergency contacts, addresses, and the
/// formations and licences they hold.
///
/// Salaries and the hour bank are not here, and will not be. A rate is history — an
/// append-only row with a date it took effect — and letting a spreadsheet overwrite it would
/// quietly rewrite what somebody was paid last March. The same goes for the hour bank, whose
/// balance is the sum of its movements.
///
/// Importing never grants anybody access to Vexta. It writes the file; the invitation is still
/// a deliberate act on the employee's own page.
/// </summary>
public class EmployeeWorkbook : IEntityWorkbook
{
    public string Slug => "employes";
    public string FileName => "employes";

    private const string Main = "Employés";
    private const string Contacts = "Contacts d'urgence";
    private const string Addresses = "Adresses";
    private const string Credentials = "Formations et permis";

    private static readonly string[] MainColumns =
    [
        "Prénom", "Nom", "Courriel", "Titre", "Téléphone", "Rôle",
    ];

    private static readonly string[] ContactColumns =
    [
        "Employé (courriel)", "Nom", "Lien", "Téléphone", "Autre téléphone", "Courriel",
        "Principal", "Note",
    ];

    private static readonly string[] AddressColumns =
    [
        "Employé (courriel)", "Libellé", "Principale", "Adresse", "Complément", "Ville",
        "Province", "Code postal", "Pays",
    ];

    private static readonly string[] CredentialColumns =
    [
        "Employé (courriel)", "Type", "Nom", "Émetteur", "Référence", "Obtenu le", "Expire le", "Note",
    ];

    public IReadOnlyList<WorkbookSheet> Template() =>
    [
        new(Main, MainColumns,
            [
                ["Marc", "Bélanger", "marc.belanger@exemple.ca", "Contremaître", "418 555-0177", "Chargé de projet"],
                ["Julie", "Roy", "julie.roy@exemple.ca", "Menuisière", "581 555-0188", "Employé"],
            ],
            "Une ligne par employé. Le courriel sert de clé et doit être unique. Rôle : Administrateur, Chargé de projet ou Employé. L'importation n'envoie aucune invitation."),
        new(Contacts, ContactColumns,
            [["marc.belanger@exemple.ca", "Chantal Bélanger", "Conjointe", "418 555-0178", "", "", "oui", ""]],
            "La colonne « Employé (courriel) » doit reprendre un courriel de l'onglet Employés."),
        new(Addresses, AddressColumns,
            [["marc.belanger@exemple.ca", "Domicile", "oui", "12 rue des Érables", "", "Lévis", "QC", "G6V 3C4", "Canada"]],
            null),
        new(Credentials, CredentialColumns,
            [["marc.belanger@exemple.ca", "Carte", "ASP Construction", "ASP", "A-884512", "2024-03-15", "2029-03-15", ""]],
            "Type : Formation, Permis ou Carte. Les dates s'écrivent AAAA-MM-JJ."),
    ];

    public async Task<IReadOnlyList<WorkbookSheet>> ExportAsync(
        VextaDbContext db, Guid tenantId, CancellationToken ct)
    {
        var employees = await db.Employees.AsNoTracking()
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName)
            .ToListAsync(ct);

        var byId = employees.ToDictionary(e => e.Id);

        var contacts = await db.EmergencyContacts.AsNoTracking().ToListAsync(ct);
        var addresses = await db.EmployeeAddresses.AsNoTracking().ToListAsync(ct);
        var credentials = await db.EmployeeCredentials.AsNoTracking().ToListAsync(ct);

        return
        [
            new(Main, MainColumns, employees.Select(e => (IReadOnlyList<string?>)
            [
                e.FirstName, e.LastName, e.Email, e.JobTitle, e.Phone, RoleLabel(e.Role),
            ]).ToList()),

            new(Contacts, ContactColumns, contacts
                .Where(c => byId.ContainsKey(c.EmployeeId))
                .Select(c => (IReadOnlyList<string?>)
                [
                    byId[c.EmployeeId].Email, c.Name, c.Relationship, c.Phone, c.AltPhone, c.Email,
                    Cell.Yes(c.IsPrimary), c.Note,
                ]).ToList()),

            new(Addresses, AddressColumns, addresses
                .Where(a => byId.ContainsKey(a.EmployeeId))
                .Select(a => (IReadOnlyList<string?>)
                [
                    byId[a.EmployeeId].Email, a.Label, Cell.Yes(a.IsPrimary), a.Line1, a.Line2,
                    a.City, a.Province, a.PostalCode, a.Country,
                ]).ToList()),

            new(Credentials, CredentialColumns, credentials
                .Where(c => byId.ContainsKey(c.EmployeeId))
                .Select(c => (IReadOnlyList<string?>)
                [
                    byId[c.EmployeeId].Email, c.Kind.ToString(), c.Name, c.Issuer, c.Reference,
                    Cell.Iso(c.IssuedOn), Cell.Iso(c.ExpiresOn), c.Note,
                ]).ToList()),
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

        var existing = await db.Employees.ToListAsync(ct);
        var byEmail = existing
            .GroupBy(e => WorkbookService.Normalise(e.Email))
            .ToDictionary(g => g.Key, g => g.First());

        foreach (var row in ClientWorkbook.Rows(sheets, Main))
        {
            var email = Cell.Text(row.Get("Courriel"));
            var first = Cell.Text(row.Get("Prénom"));
            var last = Cell.Text(row.Get("Nom"));

            if (email is null || first is null || last is null)
            {
                problems.Add($"{Main}, ligne {row.LineNumber} : prénom, nom et courriel sont obligatoires.");
                skipped++;
                continue;
            }

            var key = WorkbookService.Normalise(email);
            if (!byEmail.TryGetValue(key, out var employee))
            {
                employee = new Employee
                {
                    TenantId = tenantId,
                    FirstName = first,
                    LastName = last,
                    Email = email,
                };
                db.Employees.Add(employee);
                byEmail[key] = employee;
                created++;
            }
            else
            {
                updated++;
            }

            employee.FirstName = first;
            employee.LastName = last;
            employee.Email = email;
            employee.JobTitle = Cell.Text(row.Get("Titre"));
            employee.Phone = Cell.Text(row.Get("Téléphone"));
            employee.UpdatedAt = DateTimeOffset.UtcNow;

            // The role of somebody who can already sign in is left alone: changing it here would
            // promote or demote a live account from a spreadsheet, with nothing on screen to say
            // it happened. It is set on the employee's own page, where the consequence is in view.
            if (employee.UserId is null && ParseRole(row.Get("Rôle")) is { } role)
            {
                employee.Role = role;
            }
        }

        await db.SaveChangesAsync(ct);

        Employee? Owner(WorkbookRow row) =>
            Cell.Text(row.Get("Employé (courriel)")) is { } email
            && byEmail.TryGetValue(WorkbookService.Normalise(email), out var found)
                ? found
                : null;

        foreach (var row in ClientWorkbook.Rows(sheets, Contacts))
        {
            var employee = Owner(row);
            var name = Cell.Text(row.Get("Nom"));
            var phone = Cell.Text(row.Get("Téléphone"));

            if (employee is null || name is null || phone is null)
            {
                problems.Add($"{Contacts}, ligne {row.LineNumber} : il faut un employé connu, un nom et un téléphone.");
                skipped++;
                continue;
            }

            var contact = await db.EmergencyContacts
                .FirstOrDefaultAsync(c => c.EmployeeId == employee.Id && c.Name == name, ct);

            if (contact is null)
            {
                contact = new EmergencyContact
                {
                    TenantId = tenantId,
                    EmployeeId = employee.Id,
                    Name = name,
                    Phone = phone,
                };
                db.EmergencyContacts.Add(contact);
                created++;
            }
            else
            {
                updated++;
            }

            contact.Phone = phone;
            contact.Relationship = Cell.Text(row.Get("Lien"));
            contact.AltPhone = Cell.Text(row.Get("Autre téléphone"));
            contact.Email = Cell.Text(row.Get("Courriel"));
            contact.IsPrimary = Cell.Flag(row.Get("Principal"));
            contact.Note = Cell.Text(row.Get("Note"));
            contact.UpdatedAt = DateTimeOffset.UtcNow;
        }

        foreach (var row in ClientWorkbook.Rows(sheets, Addresses))
        {
            var employee = Owner(row);
            var line1 = Cell.Text(row.Get("Adresse"));

            if (employee is null || line1 is null)
            {
                problems.Add($"{Addresses}, ligne {row.LineNumber} : il faut un employé connu et une adresse.");
                skipped++;
                continue;
            }

            var address = await db.EmployeeAddresses
                .FirstOrDefaultAsync(a => a.EmployeeId == employee.Id && a.Line1 == line1, ct);

            if (address is null)
            {
                address = new EmployeeAddress
                {
                    TenantId = tenantId,
                    EmployeeId = employee.Id,
                    Line1 = line1,
                    City = Cell.Text(row.Get("Ville")) ?? "",
                    PostalCode = Cell.Text(row.Get("Code postal")) ?? "",
                    Country = Cell.Text(row.Get("Pays")) ?? "Canada",
                };
                db.EmployeeAddresses.Add(address);
                created++;
            }
            else
            {
                updated++;
            }

            address.Label = Cell.Text(row.Get("Libellé"));
            address.IsPrimary = Cell.Flag(row.Get("Principale"));
            address.Line2 = Cell.Text(row.Get("Complément"));
            address.City = Cell.Text(row.Get("Ville")) ?? address.City;
            address.Province = Cell.Text(row.Get("Province"));
            address.PostalCode = Cell.Text(row.Get("Code postal")) ?? address.PostalCode;
            address.Country = Cell.Text(row.Get("Pays")) ?? address.Country;
            address.UpdatedAt = DateTimeOffset.UtcNow;
        }

        foreach (var row in ClientWorkbook.Rows(sheets, Credentials))
        {
            var employee = Owner(row);
            var name = Cell.Text(row.Get("Nom"));

            if (employee is null || name is null)
            {
                problems.Add($"{Credentials}, ligne {row.LineNumber} : il faut un employé connu et un nom.");
                skipped++;
                continue;
            }

            var credential = await db.EmployeeCredentials
                .FirstOrDefaultAsync(c => c.EmployeeId == employee.Id && c.Name == name, ct);

            if (credential is null)
            {
                credential = new EmployeeCredential
                {
                    TenantId = tenantId,
                    EmployeeId = employee.Id,
                    Name = name,
                };
                db.EmployeeCredentials.Add(credential);
                created++;
            }
            else
            {
                updated++;
            }

            credential.Kind = Cell.Enum(row.Get("Type"), CredentialKind.Formation);
            credential.Issuer = Cell.Text(row.Get("Émetteur"));
            credential.Reference = Cell.Text(row.Get("Référence"));
            credential.IssuedOn = Cell.Date(row.Get("Obtenu le"));
            credential.ExpiresOn = Cell.Date(row.Get("Expire le"));
            credential.Note = Cell.Text(row.Get("Note"));
            credential.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return new ImportReport(created, updated, skipped, problems);
    }

    /// <summary>The three a company may hand out, in the words its screens use.</summary>
    private static string RoleLabel(UserRole role) => role switch
    {
        UserRole.TenantAdmin => "Administrateur",
        UserRole.ProjectManager => "Chargé de projet",
        _ => "Employé",
    };

    private static UserRole? ParseRole(string? raw) => WorkbookService.Normalise(raw) switch
    {
        "" => null,
        "administrateur" or "admin" or "tenantadmin" => UserRole.TenantAdmin,
        "charge de projet" or "chargee de projet" or "projectmanager" => UserRole.ProjectManager,
        _ => UserRole.TenantUser,
    };
}
