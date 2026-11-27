using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Hr;

/// <summary>
/// The parts of an employee's file that are facts about the person: where they live, who to
/// call, what paper they hold, what they have done before.
///
/// Every list is readable two ways — for one employee, or for the whole company — because the
/// same rows answer two different questions. "Quelles sont les adresses de Marc" belongs on his
/// card; "quelles cartes expirent ce mois-ci" belongs on the department's page, and splitting
/// them into two tables would mean keeping two things in step forever.
/// </summary>
[ApiController]
[Route("api/rh")]
[StaffOnly]
[Authorize(Roles = Roles.Managers)]
[RequireActiveSubscription]
public class EmployeeFileController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>The employee file of the person signed in, for their own leave and schedule.</summary>
    [HttpGet("moi")]
    public async Task<ActionResult<MyEmployeeDto>> Me(CancellationToken ct)
    {
        var me = await db.Employees.AsNoTracking()
            .Where(e => e.UserId == currentUser.UserId)
            .Select(e => new MyEmployeeDto(e.Id, e.FirstName + " " + e.LastName))
            .FirstOrDefaultAsync(ct);
        return me is null ? NotFound(new { message = "Aucune fiche d'employé n'est liée à votre compte." }) : Ok(me);
    }

    // ---- Adresses ----

    /// <param name="employe">One person's addresses. Omitted means every address in the company.</param>
    [HttpGet("adresses")]
    public async Task<ActionResult<List<EmployeeAddressDto>>> Addresses([FromQuery] Guid? employe, CancellationToken ct)
    {
        var items = await db.EmployeeAddresses.AsNoTracking()
            .Where(a => employe == null || a.EmployeeId == employe)
            .OrderBy(a => a.Employee!.LastName).ThenBy(a => a.Employee!.FirstName)
            .ThenByDescending(a => a.IsPrimary)
            .Select(a => new EmployeeAddressDto(
                a.Id,
                a.EmployeeId,
                a.Employee!.FirstName + " " + a.Employee!.LastName,
                a.Label,
                a.IsPrimary,
                a.Line1,
                a.Line2,
                a.City,
                a.Province,
                a.PostalCode,
                a.Country))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost("adresses")]
    [RequireBusinessTenant]
    public async Task<ActionResult<EmployeeAddressDto>> CreateAddress(SaveEmployeeAddressRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (ValidateAddress(request) is { } error) return BadRequest(new { message = error });

        if (!await db.Employees.AnyAsync(e => e.Id == request.EmployeeId, ct))
        {
            return BadRequest(new { message = "Cet employé n'existe plus." });
        }

        // The first address somebody has is their main one whether or not the box was ticked:
        // a file with one address and no primary shows none at all on the payroll's screen.
        var isFirst = !await db.EmployeeAddresses.AnyAsync(a => a.EmployeeId == request.EmployeeId, ct);
        var primary = request.IsPrimary || isFirst;

        if (primary) await ClearPrimaryAddressAsync(request.EmployeeId, null, ct);

        var address = new EmployeeAddress
        {
            TenantId = tenantId,
            EmployeeId = request.EmployeeId,
            Label = Clean(request.Label),
            IsPrimary = primary,
            Line1 = request.Line1.Trim(),
            Line2 = Clean(request.Line2),
            City = request.City.Trim(),
            Province = Clean(request.Province),
            PostalCode = request.PostalCode.Trim(),
            Country = string.IsNullOrWhiteSpace(request.Country) ? "Canada" : request.Country.Trim()
        };

        db.EmployeeAddresses.Add(address);
        await db.SaveChangesAsync(ct);

        return Ok(await AddressDtoAsync(address.Id, ct));
    }

    [HttpPut("adresses/{id:guid}")]
    public async Task<ActionResult<EmployeeAddressDto>> UpdateAddress(Guid id, SaveEmployeeAddressRequest request, CancellationToken ct)
    {
        var address = await db.EmployeeAddresses.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (address is null) return NotFound();
        if (ValidateAddress(request) is { } error) return BadRequest(new { message = error });

        if (request.IsPrimary && !address.IsPrimary) await ClearPrimaryAddressAsync(address.EmployeeId, id, ct);

        address.Label = Clean(request.Label);
        // Unticking the only primary would leave the person with none, so it stays ticked.
        address.IsPrimary = request.IsPrimary || address.IsPrimary;
        address.Line1 = request.Line1.Trim();
        address.Line2 = Clean(request.Line2);
        address.City = request.City.Trim();
        address.Province = Clean(request.Province);
        address.PostalCode = request.PostalCode.Trim();
        address.Country = string.IsNullOrWhiteSpace(request.Country) ? "Canada" : request.Country.Trim();
        address.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(await AddressDtoAsync(id, ct));
    }

    [HttpDelete("adresses/{id:guid}")]
    public async Task<IActionResult> DeleteAddress(Guid id, CancellationToken ct)
    {
        var address = await db.EmployeeAddresses.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (address is null) return NotFound();

        db.EmployeeAddresses.Remove(address);
        await db.SaveChangesAsync(ct);

        // Somebody has to be the main address. Removing the one that was promotes the oldest of
        // what is left, rather than leaving a file whose payroll address is nothing.
        if (address.IsPrimary)
        {
            var next = await db.EmployeeAddresses
                .Where(a => a.EmployeeId == address.EmployeeId)
                .OrderBy(a => a.CreatedAt)
                .FirstOrDefaultAsync(ct);

            if (next is not null)
            {
                next.IsPrimary = true;
                await db.SaveChangesAsync(ct);
            }
        }

        return NoContent();
    }

    // ---- Contacts d'urgence ----

    [HttpGet("contacts-urgence")]
    public async Task<ActionResult<List<EmergencyContactDto>>> EmergencyContacts([FromQuery] Guid? employe, CancellationToken ct)
    {
        var items = await db.EmergencyContacts.AsNoTracking()
            .Where(c => employe == null || c.EmployeeId == employe)
            .OrderBy(c => c.Employee!.LastName).ThenBy(c => c.Employee!.FirstName)
            .ThenByDescending(c => c.IsPrimary)
            .Select(ContactProjection())
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost("contacts-urgence")]
    [RequireBusinessTenant]
    public async Task<ActionResult<EmergencyContactDto>> CreateContact(SaveEmergencyContactRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (ValidateContact(request) is { } error) return BadRequest(new { message = error });

        if (!await db.Employees.AnyAsync(e => e.Id == request.EmployeeId, ct))
        {
            return BadRequest(new { message = "Cet employé n'existe plus." });
        }

        var isFirst = !await db.EmergencyContacts.AnyAsync(c => c.EmployeeId == request.EmployeeId, ct);
        var primary = request.IsPrimary || isFirst;

        if (primary) await ClearPrimaryContactAsync(request.EmployeeId, null, ct);

        var contact = new EmergencyContact
        {
            TenantId = tenantId,
            EmployeeId = request.EmployeeId,
            Name = request.Name.Trim(),
            Relationship = Clean(request.Relationship),
            Phone = request.Phone.Trim(),
            AltPhone = Clean(request.AltPhone),
            Email = Clean(request.Email),
            IsPrimary = primary,
            Note = Clean(request.Note)
        };

        db.EmergencyContacts.Add(contact);
        await db.SaveChangesAsync(ct);

        return Ok(await ContactDtoAsync(contact.Id, ct));
    }

    [HttpPut("contacts-urgence/{id:guid}")]
    public async Task<ActionResult<EmergencyContactDto>> UpdateContact(Guid id, SaveEmergencyContactRequest request, CancellationToken ct)
    {
        var contact = await db.EmergencyContacts.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (contact is null) return NotFound();
        if (ValidateContact(request) is { } error) return BadRequest(new { message = error });

        if (request.IsPrimary && !contact.IsPrimary) await ClearPrimaryContactAsync(contact.EmployeeId, id, ct);

        contact.Name = request.Name.Trim();
        contact.Relationship = Clean(request.Relationship);
        contact.Phone = request.Phone.Trim();
        contact.AltPhone = Clean(request.AltPhone);
        contact.Email = Clean(request.Email);
        contact.IsPrimary = request.IsPrimary || contact.IsPrimary;
        contact.Note = Clean(request.Note);
        contact.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(await ContactDtoAsync(id, ct));
    }

    [HttpDelete("contacts-urgence/{id:guid}")]
    public async Task<IActionResult> DeleteContact(Guid id, CancellationToken ct)
    {
        var contact = await db.EmergencyContacts.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (contact is null) return NotFound();

        db.EmergencyContacts.Remove(contact);
        await db.SaveChangesAsync(ct);

        if (contact.IsPrimary)
        {
            var next = await db.EmergencyContacts
                .Where(c => c.EmployeeId == contact.EmployeeId)
                .OrderBy(c => c.CreatedAt)
                .FirstOrDefaultAsync(ct);

            if (next is not null)
            {
                next.IsPrimary = true;
                await db.SaveChangesAsync(ct);
            }
        }

        return NoContent();
    }

    // ---- Formations et permis ----

    /// <param name="expireAvant">
    /// Only what runs out on or before this day. How the department asks the one question this
    /// list exists for: who is about to be turned around at a gate.
    /// </param>
    [HttpGet("formations")]
    public async Task<ActionResult<List<EmployeeCredentialDto>>> Credentials(
        [FromQuery] Guid? employe, [FromQuery] DateOnly? expireAvant, CancellationToken ct)
    {
        var today = BusinessDay.Today;

        var rows = await db.EmployeeCredentials.AsNoTracking()
            .Where(c => employe == null || c.EmployeeId == employe)
            .Where(c => expireAvant == null || (c.ExpiresOn != null && c.ExpiresOn <= expireAvant))
            // Nulls last: something that never expires is not urgent, and Postgres would
            // otherwise sort it to the top of an ascending list.
            .OrderBy(c => c.ExpiresOn == null).ThenBy(c => c.ExpiresOn).ThenBy(c => c.Name)
            .Select(c => new
            {
                c.Id,
                c.EmployeeId,
                EmployeeName = c.Employee!.FirstName + " " + c.Employee!.LastName,
                c.Kind,
                c.Name,
                c.Issuer,
                c.Reference,
                c.IssuedOn,
                c.ExpiresOn,
                c.MediaAssetId,
                FileName = c.MediaAsset != null ? c.MediaAsset.FileName : null,
                c.Note
            })
            .ToListAsync(ct);

        // The day count is worked out here rather than in SQL: date arithmetic that has to mean
        // the same thing in Postgres and in C# is a place where off-by-one lives.
        var items = rows.Select(c => new EmployeeCredentialDto(
            c.Id, c.EmployeeId, c.EmployeeName, c.Kind, c.Name, c.Issuer, c.Reference,
            c.IssuedOn, c.ExpiresOn, c.MediaAssetId, c.FileName, c.Note,
            c.ExpiresOn is { } on ? on.DayNumber - today.DayNumber : null)).ToList();

        return Ok(items);
    }

    [HttpPost("formations")]
    [RequireBusinessTenant]
    public async Task<ActionResult<EmployeeCredentialDto>> CreateCredential(SaveEmployeeCredentialRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (await ValidateCredentialAsync(request, ct) is { } error) return BadRequest(new { message = error });

        var credential = new EmployeeCredential
        {
            TenantId = tenantId,
            EmployeeId = request.EmployeeId,
            Kind = request.Kind,
            Name = request.Name.Trim(),
            Issuer = Clean(request.Issuer),
            Reference = Clean(request.Reference),
            IssuedOn = request.IssuedOn,
            ExpiresOn = request.ExpiresOn,
            MediaAssetId = request.MediaAssetId,
            Note = Clean(request.Note)
        };

        db.EmployeeCredentials.Add(credential);
        await db.SaveChangesAsync(ct);

        return Ok(await CredentialDtoAsync(credential.Id, ct));
    }

    [HttpPut("formations/{id:guid}")]
    public async Task<ActionResult<EmployeeCredentialDto>> UpdateCredential(
        Guid id, SaveEmployeeCredentialRequest request, CancellationToken ct)
    {
        var credential = await db.EmployeeCredentials.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (credential is null) return NotFound();
        if (await ValidateCredentialAsync(request, ct) is { } error) return BadRequest(new { message = error });

        credential.EmployeeId = request.EmployeeId;
        credential.Kind = request.Kind;
        credential.Name = request.Name.Trim();
        credential.Issuer = Clean(request.Issuer);
        credential.Reference = Clean(request.Reference);
        credential.IssuedOn = request.IssuedOn;
        credential.ExpiresOn = request.ExpiresOn;
        credential.MediaAssetId = request.MediaAssetId;
        credential.Note = Clean(request.Note);
        credential.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(await CredentialDtoAsync(id, ct));
    }

    [HttpDelete("formations/{id:guid}")]
    public async Task<IActionResult> DeleteCredential(Guid id, CancellationToken ct)
    {
        var credential = await db.EmployeeCredentials.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (credential is null) return NotFound();

        db.EmployeeCredentials.Remove(credential);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- CV ----

    [HttpGet("employes/{employeeId:guid}/cv")]
    public async Task<ActionResult<List<EmployeeCvEntryDto>>> Cv(Guid employeeId, CancellationToken ct)
    {
        var items = await db.EmployeeCvEntries.AsNoTracking()
            .Where(c => c.EmployeeId == employeeId)
            // Within a kind: most recent first, because that is the part anybody reads.
            .OrderBy(c => c.Kind).ThenBy(c => c.SortOrder).ThenByDescending(c => c.StartOn)
            .Select(c => new EmployeeCvEntryDto(
                c.Id, c.Kind, c.Title, c.Organization, c.StartOn, c.EndOn, c.Description, c.SortOrder))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost("employes/{employeeId:guid}/cv")]
    [RequireBusinessTenant]
    public async Task<ActionResult<EmployeeCvEntryDto>> CreateCvEntry(
        Guid employeeId, SaveEmployeeCvEntryRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (ValidateCv(request) is { } error) return BadRequest(new { message = error });

        if (!await db.Employees.AnyAsync(e => e.Id == employeeId, ct))
        {
            return BadRequest(new { message = "Cet employé n'existe plus." });
        }

        var entry = new EmployeeCvEntry
        {
            TenantId = tenantId,
            EmployeeId = employeeId,
            Kind = request.Kind,
            Title = request.Title.Trim(),
            Organization = Clean(request.Organization),
            StartOn = request.StartOn,
            EndOn = request.EndOn,
            Description = Clean(request.Description),
            SortOrder = request.SortOrder
        };

        db.EmployeeCvEntries.Add(entry);
        await db.SaveChangesAsync(ct);

        return Ok(ToCvDto(entry));
    }

    [HttpPut("cv/{id:guid}")]
    public async Task<ActionResult<EmployeeCvEntryDto>> UpdateCvEntry(
        Guid id, SaveEmployeeCvEntryRequest request, CancellationToken ct)
    {
        var entry = await db.EmployeeCvEntries.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (entry is null) return NotFound();
        if (ValidateCv(request) is { } error) return BadRequest(new { message = error });

        entry.Kind = request.Kind;
        entry.Title = request.Title.Trim();
        entry.Organization = Clean(request.Organization);
        entry.StartOn = request.StartOn;
        entry.EndOn = request.EndOn;
        entry.Description = Clean(request.Description);
        entry.SortOrder = request.SortOrder;
        entry.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(ToCvDto(entry));
    }

    [HttpDelete("cv/{id:guid}")]
    public async Task<IActionResult> DeleteCvEntry(Guid id, CancellationToken ct)
    {
        var entry = await db.EmployeeCvEntries.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (entry is null) return NotFound();

        db.EmployeeCvEntries.Remove(entry);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Feuilles de temps ----

    /// <summary>
    /// One employee's hours, a week at a time.
    ///
    /// The same shape as <c>api/moi/heures</c>, which is what an employee reads about
    /// themselves. The answer has to be the same answer: the week someone sees on their own
    /// screen and the week the office sees on their file disagreeing is a conversation nobody
    /// can win.
    /// </summary>
    /// <param name="semaine">Any day in the week being asked for. Omitted means this one.</param>
    [HttpGet("employes/{employeeId:guid}/heures")]
    public async Task<ActionResult<EmployeeWeekDto>> Hours(
        Guid employeeId, [FromQuery] DateOnly? semaine, CancellationToken ct)
    {
        var start = MondayOf(semaine ?? BusinessDay.Today);
        var end = start.AddDays(6);

        // Overlapping, not starting inside: a shift that begins Sunday at 22 h and ends Monday
        // at 2 h belongs to both weeks, and dropping it from one of them loses paid hours.
        var rows = await db.TimesheetEntries.AsNoTracking()
            .Where(x => x.EmployeeId == employeeId && x.StartDate <= end && x.EndDate >= start)
            .OrderBy(x => x.StartDate).ThenBy(x => x.StartTime)
            .Select(x => new
            {
                x.Id,
                x.ProjectId,
                ProjectNumber = x.Project!.Number,
                ClientName = x.Project!.Client!.Name,
                ProjectDescription = x.Project!.Description,
                x.StartDate,
                x.EndDate,
                x.StartTime,
                x.EndTime,
                x.Hours,
                x.Note
            })
            .ToListAsync(ct);

        var entries = rows.Select(x => new EmployeeTimesheetDto(
            x.Id,
            x.ProjectId,
            x.ProjectNumber,
            x.ClientName,
            x.ProjectDescription,
            x.StartDate,
            x.EndDate,
            x.StartTime.ToString(@"HH\:mm"),
            x.EndTime.ToString(@"HH\:mm"),
            x.Hours,
            x.Note)).ToList();

        return Ok(new EmployeeWeekDto(start, end, entries.Sum(e => e.Hours), entries));
    }

    /// <summary>Monday, because that is the week a Québec payroll runs on.</summary>
    private static DateOnly MondayOf(DateOnly day) =>
        day.AddDays(-(((int)day.DayOfWeek + 6) % 7));

    // ---- Les pastilles ----

    /// <summary>
    /// The badges on one employee's rail, in one call.
    ///
    /// Thirteen sections asking for their own count would be thirteen requests to draw a
    /// sidebar. The rail is meant to be read as a summary of the file before anything in it is
    /// opened, which only works if the numbers arrive together.
    /// </summary>
    [HttpGet("employes/{employeeId:guid}/sections")]
    public async Task<ActionResult<EmployeeFileCountsDto>> EmployeeSectionCounts(Guid employeeId, CancellationToken ct)
    {
        if (!await db.Employees.AnyAsync(e => e.Id == employeeId, ct)) return NotFound();

        return Ok(new EmployeeFileCountsDto(
            await db.EmergencyContacts.CountAsync(c => c.EmployeeId == employeeId, ct),
            await db.EmployeeAddresses.CountAsync(a => a.EmployeeId == employeeId, ct),
            await db.EmployeeCvEntries.CountAsync(c => c.EmployeeId == employeeId, ct),
            await db.EmployeeWages.CountAsync(w => w.EmployeeId == employeeId, ct),
            await db.EmployeeCredentials.CountAsync(c => c.EmployeeId == employeeId, ct),
            // Only what is still waiting: a count that only ever grows is a count people stop
            // reading, and an answered request is history the moment it is answered.
            await db.LeaveRequests.CountAsync(l => l.EmployeeId == employeeId && l.Status == LeaveStatus.EnAttente, ct),
            await db.HourBankEntries.CountAsync(h => h.EmployeeId == employeeId, ct),
            await db.HrDocuments.CountAsync(d => d.EmployeeId == employeeId, ct)));
    }


    [HttpGet("sections")]
    public async Task<ActionResult<HrSectionCountsDto>> SectionCounts(CancellationToken ct)
    {
        return Ok(new HrSectionCountsDto(
            await db.Employees.CountAsync(ct),
            await db.Teams.CountAsync(ct),
            await db.EmployeeAddresses.CountAsync(ct),
            await db.EmergencyContacts.CountAsync(ct),
            // Only the ones still in play: somebody refused last spring is not a candidate the
            // department has to do anything about.
            await db.Candidates.CountAsync(
                c => c.Status != CandidateStatus.Refuse
                  && c.Status != CandidateStatus.Retire
                  && c.Status != CandidateStatus.Embauche, ct),
            await db.EmployeeCredentials.CountAsync(ct),
            await db.LeaveRequests.CountAsync(l => l.Status == LeaveStatus.EnAttente, ct),
            await db.HrDocuments.CountAsync(ct)));
    }

    // ---- Helpers ----

    private async Task ClearPrimaryAddressAsync(Guid employeeId, Guid? except, CancellationToken ct)
    {
        var others = await db.EmployeeAddresses
            .Where(a => a.EmployeeId == employeeId && a.IsPrimary && (except == null || a.Id != except))
            .ToListAsync(ct);

        foreach (var other in others) other.IsPrimary = false;
    }

    private async Task ClearPrimaryContactAsync(Guid employeeId, Guid? except, CancellationToken ct)
    {
        var others = await db.EmergencyContacts
            .Where(c => c.EmployeeId == employeeId && c.IsPrimary && (except == null || c.Id != except))
            .ToListAsync(ct);

        foreach (var other in others) other.IsPrimary = false;
    }

    // Each re-reads the one row it just wrote rather than calling the list endpoint and
    // filtering: the saved row needs the employee's name beside it, and reading the whole
    // company's addresses to find one is a query that grows with the payroll.

    private async Task<EmployeeAddressDto> AddressDtoAsync(Guid id, CancellationToken ct) =>
        await db.EmployeeAddresses.AsNoTracking()
            .Where(a => a.Id == id)
            .Select(a => new EmployeeAddressDto(
                a.Id,
                a.EmployeeId,
                a.Employee!.FirstName + " " + a.Employee!.LastName,
                a.Label,
                a.IsPrimary,
                a.Line1,
                a.Line2,
                a.City,
                a.Province,
                a.PostalCode,
                a.Country))
            .FirstAsync(ct);

    private async Task<EmergencyContactDto> ContactDtoAsync(Guid id, CancellationToken ct) =>
        await db.EmergencyContacts.AsNoTracking()
            .Where(c => c.Id == id)
            .Select(ContactProjection())
            .FirstAsync(ct);

    private async Task<EmployeeCredentialDto> CredentialDtoAsync(Guid id, CancellationToken ct)
    {
        var today = BusinessDay.Today;

        var row = await db.EmployeeCredentials.AsNoTracking()
            .Where(c => c.Id == id)
            .Select(c => new
            {
                c.Id,
                c.EmployeeId,
                EmployeeName = c.Employee!.FirstName + " " + c.Employee!.LastName,
                c.Kind,
                c.Name,
                c.Issuer,
                c.Reference,
                c.IssuedOn,
                c.ExpiresOn,
                c.MediaAssetId,
                FileName = c.MediaAsset != null ? c.MediaAsset.FileName : null,
                c.Note
            })
            .FirstAsync(ct);

        return new EmployeeCredentialDto(
            row.Id, row.EmployeeId, row.EmployeeName, row.Kind, row.Name, row.Issuer, row.Reference,
            row.IssuedOn, row.ExpiresOn, row.MediaAssetId, row.FileName, row.Note,
            row.ExpiresOn is { } on ? on.DayNumber - today.DayNumber : null);
    }

    private static System.Linq.Expressions.Expression<Func<EmergencyContact, EmergencyContactDto>> ContactProjection() =>
        c => new EmergencyContactDto(
            c.Id,
            c.EmployeeId,
            c.Employee!.FirstName + " " + c.Employee!.LastName,
            c.Name,
            c.Relationship,
            c.Phone,
            c.AltPhone,
            c.Email,
            c.IsPrimary,
            c.Note);

    private static EmployeeCvEntryDto ToCvDto(EmployeeCvEntry c) =>
        new(c.Id, c.Kind, c.Title, c.Organization, c.StartOn, c.EndOn, c.Description, c.SortOrder);

    private static string? ValidateAddress(SaveEmployeeAddressRequest r)
    {
        if (r.EmployeeId == Guid.Empty) return "Choisissez l'employé à qui cette adresse appartient.";
        if (string.IsNullOrWhiteSpace(r.Line1)) return "L'adresse est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.City)) return "La ville est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.PostalCode)) return "Le code postal est obligatoire.";
        return null;
    }

    private static string? ValidateContact(SaveEmergencyContactRequest r)
    {
        if (r.EmployeeId == Guid.Empty) return "Choisissez l'employé à qui ce contact appartient.";
        if (string.IsNullOrWhiteSpace(r.Name)) return "Le nom du contact est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.Phone)) return "Un contact d'urgence sans numéro ne sert à rien.";
        return null;
    }

    private async Task<string?> ValidateCredentialAsync(SaveEmployeeCredentialRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return "Le nom de la formation ou du permis est obligatoire.";
        if (r.IssuedOn is { } from && r.ExpiresOn is { } to && to < from)
        {
            return "L'expiration ne peut pas précéder l'émission.";
        }
        if (!await db.Employees.AnyAsync(e => e.Id == r.EmployeeId, ct))
        {
            return "Cet employé n'existe plus.";
        }
        if (r.MediaAssetId is { } assetId && !await db.MediaAssets.AnyAsync(m => m.Id == assetId, ct))
        {
            return "Ce fichier n'existe plus.";
        }
        return null;
    }

    private static string? ValidateCv(SaveEmployeeCvEntryRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Title)) return "Le titre est obligatoire.";
        if (r.StartOn is { } from && r.EndOn is { } to && to < from) return "La fin ne peut pas précéder le début.";
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public record MyEmployeeDto(Guid Id, string Name);
