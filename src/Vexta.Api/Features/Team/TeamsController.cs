using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Team;

using TeamEntity = Vexta.Api.Domain.Team;

/// <summary>
/// Named groups of employees, the company's own locations, and the files HR keeps. All three
/// are the owner's business, which is why they sit behind the same role check as the staff list.
/// </summary>
[ApiController]
[Route("api/hr")]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public class HumanResourcesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>Feeds the four pills in one call, so the page does not fetch four lists to count them.</summary>
    [HttpGet("counts")]
    public async Task<ActionResult<HrCountsDto>> Counts(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        return Ok(new HrCountsDto(
            await db.Employees.CountAsync(ct),
            await db.Teams.CountAsync(ct),
            await db.CompanyLocations.CountAsync(ct),
            await db.HrDocuments.CountAsync(ct)));
    }

    // ---- Teams ----

    [HttpGet("teams")]
    public async Task<ActionResult<List<TeamDto>>> Teams(CancellationToken ct)
    {
        var teams = await db.Teams.AsNoTracking()
            .Include(t => t.Members)
            .Include(t => t.LeadEmployee)
            .OrderBy(t => t.Name)
            .ToListAsync(ct);

        return Ok(teams.Select(ToDto).ToList());
    }

    [HttpPost("teams")]
    [RequireBusinessTenant]
    public async Task<ActionResult<TeamDto>> CreateTeam(SaveTeamRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (ValidateTeam(request) is { } error) return BadRequest(new { message = error });

        var name = request.Name.Trim();
        if (await db.Teams.AnyAsync(t => t.Name == name, ct))
        {
            return Conflict(new { message = "Une équipe porte déjà ce nom." });
        }

        var team = new TeamEntity
        {
            TenantId = tenantId,
            Name = name,
            Description = Clean(request.Description),
            LeadEmployeeId = request.LeadEmployeeId,
            Members = await LoadMembersAsync(request.MemberIds, ct)
        };

        if (await InvalidLeadAsync(team, ct) is { } leadError) return BadRequest(new { message = leadError });

        db.Teams.Add(team);
        await db.SaveChangesAsync(ct);

        return Ok(ToDto(await LoadTeamAsync(team.Id, ct))!);
    }

    [HttpPut("teams/{id:guid}")]
    public async Task<ActionResult<TeamDto>> UpdateTeam(Guid id, SaveTeamRequest request, CancellationToken ct)
    {
        var team = await db.Teams.Include(t => t.Members).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (team is null) return NotFound();
        if (ValidateTeam(request) is { } error) return BadRequest(new { message = error });

        var name = request.Name.Trim();
        if (name != team.Name && await db.Teams.AnyAsync(t => t.Name == name && t.Id != id, ct))
        {
            return Conflict(new { message = "Une équipe porte déjà ce nom." });
        }

        team.Name = name;
        team.Description = Clean(request.Description);
        team.LeadEmployeeId = request.LeadEmployeeId;
        team.Members = await LoadMembersAsync(request.MemberIds, ct);
        team.UpdatedAt = DateTimeOffset.UtcNow;

        if (await InvalidLeadAsync(team, ct) is { } leadError) return BadRequest(new { message = leadError });

        await db.SaveChangesAsync(ct);
        return Ok(ToDto(await LoadTeamAsync(id, ct))!);
    }

    [HttpDelete("teams/{id:guid}")]
    public async Task<IActionResult> DeleteTeam(Guid id, CancellationToken ct)
    {
        var team = await db.Teams.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (team is null) return NotFound();

        db.Teams.Remove(team);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Company locations ----

    [HttpGet("locations")]
    public async Task<ActionResult<List<CompanyLocationDto>>> Locations(CancellationToken ct)
    {
        var items = await db.CompanyLocations.AsNoTracking()
            .OrderByDescending(l => l.IsPrimary).ThenBy(l => l.Label)
            .Select(LocationToDto())
            .ToListAsync(ct);
        return Ok(items);
    }

    [HttpPost("locations")]
    [RequireBusinessTenant]
    public async Task<ActionResult<CompanyLocationDto>> CreateLocation(SaveCompanyLocationRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (ValidateLocation(request) is { } error) return BadRequest(new { message = error });

        // The first one is the primary whether or not the box was ticked: a company with one
        // address and no primary would show none on its own profile.
        var isFirst = !await db.CompanyLocations.AnyAsync(ct);
        var primary = request.IsPrimary || isFirst;

        if (primary) await ClearPrimaryAsync(null, ct);

        var location = new CompanyLocation
        {
            TenantId = tenantId,
            Label = request.Label.Trim(),
            IsPrimary = primary,
            Line1 = request.Line1.Trim(),
            Line2 = Clean(request.Line2),
            City = request.City.Trim(),
            Province = Clean(request.Province),
            PostalCode = request.PostalCode.Trim(),
            Country = string.IsNullOrWhiteSpace(request.Country) ? "Canada" : request.Country.Trim(),
            Phone = Clean(request.Phone)
        };

        db.CompanyLocations.Add(location);
        await db.SaveChangesAsync(ct);
        return Ok(ToLocationDto(location));
    }

    [HttpPut("locations/{id:guid}")]
    public async Task<ActionResult<CompanyLocationDto>> UpdateLocation(Guid id, SaveCompanyLocationRequest request, CancellationToken ct)
    {
        var location = await db.CompanyLocations.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (location is null) return NotFound();
        if (ValidateLocation(request) is { } error) return BadRequest(new { message = error });

        if (request.IsPrimary && !location.IsPrimary) await ClearPrimaryAsync(id, ct);

        location.Label = request.Label.Trim();
        // Unticking the only primary would leave the company with none, so it stays.
        location.IsPrimary = request.IsPrimary || location.IsPrimary;
        location.Line1 = request.Line1.Trim();
        location.Line2 = Clean(request.Line2);
        location.City = request.City.Trim();
        location.Province = Clean(request.Province);
        location.PostalCode = request.PostalCode.Trim();
        location.Country = string.IsNullOrWhiteSpace(request.Country) ? "Canada" : request.Country.Trim();
        location.Phone = Clean(request.Phone);
        location.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(ToLocationDto(location));
    }

    [HttpDelete("locations/{id:guid}")]
    public async Task<IActionResult> DeleteLocation(Guid id, CancellationToken ct)
    {
        var location = await db.CompanyLocations.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (location is null) return NotFound();

        db.CompanyLocations.Remove(location);
        await db.SaveChangesAsync(ct);

        // Never leave the company without a primary: the oldest remaining one takes over.
        if (location.IsPrimary)
        {
            var next = await db.CompanyLocations.OrderBy(l => l.CreatedAt).FirstOrDefaultAsync(ct);
            if (next is not null)
            {
                next.IsPrimary = true;
                await db.SaveChangesAsync(ct);
            }
        }

        return NoContent();
    }

    // ---- Documents ----

    [HttpGet("documents")]
    public async Task<ActionResult<List<HrDocumentDto>>> Documents(CancellationToken ct)
    {
        var items = await db.HrDocuments.AsNoTracking()
            .Include(d => d.Employee)
            .Include(d => d.MediaAsset)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(ct);

        return Ok(items.Select(ToDocumentDto).ToList());
    }

    [HttpPost("documents")]
    [RequireBusinessTenant]
    public async Task<ActionResult<HrDocumentDto>> CreateDocument(SaveHrDocumentRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (string.IsNullOrWhiteSpace(request.Title)) return BadRequest(new { message = "Le titre est obligatoire." });

        // The query filter already scopes this to the tenant, so a foreign asset id simply is
        // not found rather than being attachable.
        if (!await db.MediaAssets.AnyAsync(m => m.Id == request.MediaAssetId, ct))
        {
            return BadRequest(new { message = "Le fichier téléversé est introuvable." });
        }

        if (request.EmployeeId is { } employeeId && !await db.Employees.AnyAsync(e => e.Id == employeeId, ct))
        {
            return BadRequest(new { message = "Cet employé n'existe pas." });
        }

        var document = new HrDocument
        {
            TenantId = tenantId,
            Title = request.Title.Trim(),
            Category = Clean(request.Category),
            EmployeeId = request.EmployeeId,
            MediaAssetId = request.MediaAssetId
        };

        db.HrDocuments.Add(document);
        await db.SaveChangesAsync(ct);

        var created = await db.HrDocuments.AsNoTracking()
            .Include(d => d.Employee).Include(d => d.MediaAsset)
            .FirstAsync(d => d.Id == document.Id, ct);

        return Ok(ToDocumentDto(created));
    }

    [HttpDelete("documents/{id:guid}")]
    public async Task<IActionResult> DeleteDocument(Guid id, CancellationToken ct)
    {
        var document = await db.HrDocuments.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (document is null) return NotFound();

        // Only the HR entry goes. The file stays in the library, where it may be in use
        // elsewhere, and removing it is that page's decision to make.
        db.HrDocuments.Remove(document);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Helpers ----

    private Task<TeamEntity?> LoadTeamAsync(Guid id, CancellationToken ct) =>
        db.Teams.AsNoTracking().Include(t => t.Members).Include(t => t.LeadEmployee)
            .FirstOrDefaultAsync(t => t.Id == id, ct);

    private async Task<List<Employee>> LoadMembersAsync(IReadOnlyList<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return [];
        var distinct = ids.Distinct().ToList();
        return await db.Employees.Where(e => distinct.Contains(e.Id)).ToListAsync(ct);
    }

    /// <summary>A lead who is not on the team would be a name on a list nobody can act through.</summary>
    private async Task<string?> InvalidLeadAsync(TeamEntity team, CancellationToken ct)
    {
        if (team.LeadEmployeeId is not { } leadId) return null;
        if (!await db.Employees.AnyAsync(e => e.Id == leadId, ct)) return "Ce responsable n'existe pas.";
        if (!team.Members.Any(m => m.Id == leadId)) return "Le responsable doit faire partie de l'équipe.";
        return null;
    }

    private async Task ClearPrimaryAsync(Guid? exceptId, CancellationToken ct)
    {
        var current = await db.CompanyLocations.Where(l => l.IsPrimary && l.Id != exceptId).ToListAsync(ct);
        foreach (var location in current) location.IsPrimary = false;
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? ValidateTeam(SaveTeamRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return "Le nom de l'équipe est obligatoire.";
        if (r.Name.Trim().Length > 100) return "100 caractères maximum.";
        return null;
    }

    private static string? ValidateLocation(SaveCompanyLocationRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Label)) return "Le nom du lieu est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.Line1)) return "L'adresse est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.City)) return "La ville est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.PostalCode)) return "Le code postal est obligatoire.";
        return null;
    }

    private static TeamDto ToDto(TeamEntity? t) => t is null
        ? null!
        : new TeamDto(
            t.Id,
            t.Name,
            t.Description,
            t.LeadEmployeeId,
            t.LeadEmployee is null ? null : $"{t.LeadEmployee.FirstName} {t.LeadEmployee.LastName}",
            t.Members
                .OrderBy(m => m.LastName).ThenBy(m => m.FirstName)
                .Select(m => new TeamMemberDto(m.Id, m.FirstName, m.LastName, m.JobTitle))
                .ToList(),
            t.CreatedAt);

    private static System.Linq.Expressions.Expression<Func<CompanyLocation, CompanyLocationDto>> LocationToDto() =>
        l => new CompanyLocationDto(l.Id, l.Label, l.IsPrimary, l.Line1, l.Line2, l.City, l.Province, l.PostalCode, l.Country, l.Phone);

    private static CompanyLocationDto ToLocationDto(CompanyLocation l) =>
        new(l.Id, l.Label, l.IsPrimary, l.Line1, l.Line2, l.City, l.Province, l.PostalCode, l.Country, l.Phone);

    private static HrDocumentDto ToDocumentDto(HrDocument d) => new(
        d.Id,
        d.Title,
        d.Category,
        d.EmployeeId,
        d.Employee is null ? null : $"{d.Employee.FirstName} {d.Employee.LastName}",
        d.MediaAssetId,
        d.MediaAsset?.FileName ?? "",
        d.MediaAsset?.ContentType ?? "",
        d.MediaAsset?.SizeBytes ?? 0,
        d.CreatedAt);
}
