using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

[ApiController]
[Route("api/projects")]
// Client is in the list because a customer reads their own projects and invoices here; the
// query filter is what confines them to their own, and [StaffOnly] on every write is what
// stops them changing anything.
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)},{nameof(UserRole.Client)}")]
[RequireActiveSubscription]
public class ProjectsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<ProjectDto>>> List(
        [FromQuery] PagingQuery query, [FromQuery] Guid? clientId, [FromQuery] ProjectStatus? status)
    {
        var projects = db.Projects.AsNoTracking().AsQueryable();

        if (clientId is not null) projects = projects.Where(p => p.ClientId == clientId);
        if (status is not null) projects = projects.Where(p => p.Status == status);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // A project has no name to search, so what is left is who it is for, the client's
            // own PO, and its number — typed either as 12 or as P-0012, which is how it is read
            // off a document.
            var search = query.Search.Trim();
            var digits = new string(search.Where(char.IsDigit).ToArray());
            var number = int.TryParse(digits, out var parsed) ? parsed : (int?)null;

            projects = projects.Where(p =>
                p.Client!.Name.Contains(search)
                || p.PoNumber!.Contains(search)
                || (number != null && p.Number == number));
        }

        var totalCount = await projects.CountAsync();

        var items = await projects
            .OrderByDescending(p => p.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(ToDto())
            .ToListAsync();

        return Ok(new PagedResult<ProjectDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectDto>> Get(Guid id)
    {
        var project = await GetDtoAsync(id);
        return project is null ? NotFound() : Ok(project);
    }

    // Reading is open to the customer this record belongs to — the query filter already
    // narrows it to theirs. Writing is not: a client does not raise their own invoice, and
    // "they can only see their own" is not the same promise as "they can change it".
    [HttpPost]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectDto>> Create(UpsertProjectRequest request)
    {
        var clientExists = await db.Clients.AnyAsync(c => c.Id == request.ClientId);
        if (!clientExists) return BadRequest(new { message = "Client introuvable." });
        if (await InvalidAddressesAsync(request) is { } addressError) return BadRequest(new { message = addressError });

        var tenantId = currentUser.TenantId!.Value;
        var project = new Project
        {
            TenantId = tenantId,
            Number = await NextNumberAsync(tenantId),
            ClientId = request.ClientId,
            PoNumber = Clean(request.PoNumber),
            Description = request.Description,
            Status = request.Status,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Budget = request.Budget
        };

        ApplyAddresses(project, request);
        db.Projects.Add(project);
        await db.SaveChangesAsync();

        var dto = await GetDtoAsync(project.Id);
        return CreatedAtAction(nameof(Get), new { id = project.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    [StaffOnly]
    public async Task<ActionResult<ProjectDto>> Update(Guid id, UpsertProjectRequest request)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return NotFound();

        if (await InvalidAddressesAsync(request) is { } addressError) return BadRequest(new { message = addressError });

        project.ClientId = request.ClientId;
        project.PoNumber = Clean(request.PoNumber);
        project.Description = request.Description;
        project.Status = request.Status;
        project.StartDate = request.StartDate;
        project.EndDate = request.EndDate;
        project.Budget = request.Budget;
        project.UpdatedAt = DateTimeOffset.UtcNow;

        ApplyAddresses(project, request);

        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    [HttpDelete("{id:guid}")]
    [StaffOnly]
    public async Task<IActionResult> Delete(Guid id)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return NotFound();

        db.Projects.Remove(project);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Max + 1, not count + 1: deleting a project must not hand its number to the next one.
    /// The unique index is what makes a simultaneous creation fail rather than collide silently.
    /// </summary>
    private async Task<int> NextNumberAsync(Guid tenantId)
    {
        var highest = await db.Projects.IgnoreQueryFilters()
            .Where(p => p.TenantId == tenantId)
            .MaxAsync(p => (int?)p.Number) ?? 0;

        return highest + 1;
    }

    /// <summary>
    /// Both addresses have to belong to the client being billed. Checked rather than trusted:
    /// the ids come from the browser, and one pointing at another client's address would print
    /// that client's street on this one's invoice.
    /// </summary>
    private async Task<string?> InvalidAddressesAsync(UpsertProjectRequest request)
    {
        foreach (var addressId in new[] { request.ClientAddressId, request.SameAddressAsClient ? null : request.SiteAddressId })
        {
            if (addressId is not { } id) continue;
            if (!await db.Addresses.AnyAsync(a => a.Id == id && a.ClientId == request.ClientId))
            {
                return "Cette adresse n'appartient pas à ce client.";
            }
        }

        return null;
    }

    /// <summary>
    /// When the site is the billing address, the site address is cleared rather than copied.
    /// A copy would go stale the moment the client's address changes, and nothing would say so.
    /// </summary>
    private static void ApplyAddresses(Project project, UpsertProjectRequest request)
    {
        project.ClientAddressId = request.ClientAddressId;
        project.SameAddressAsClient = request.SameAddressAsClient;
        project.SiteAddressId = request.SameAddressAsClient ? null : request.SiteAddressId;
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private Task<ProjectDto?> GetDtoAsync(Guid id) =>
        db.Projects.AsNoTracking().Where(p => p.Id == id).Select(ToDto()).FirstOrDefaultAsync();

    private static System.Linq.Expressions.Expression<Func<Project, ProjectDto>> ToDto() => p => new ProjectDto(
        p.Id,
        p.Number,
        p.ClientId,
        p.Client!.Name,
        p.PoNumber,
        p.Description,
        p.Status,
        p.StartDate,
        p.EndDate,
        p.Budget,
        p.ClientAddress == null
            ? null
            : new ProjectAddressDto(p.ClientAddress.Id, p.ClientAddress.Line1, p.ClientAddress.Line2,
                p.ClientAddress.City, p.ClientAddress.Province, p.ClientAddress.PostalCode),
        p.SameAddressAsClient,
        p.SiteAddress == null
            ? null
            : new ProjectAddressDto(p.SiteAddress.Id, p.SiteAddress.Line1, p.SiteAddress.Line2,
                p.SiteAddress.City, p.SiteAddress.Province, p.SiteAddress.PostalCode),
        p.Invoices.Count,
        p.CreatedAt,
        p.UpdatedAt);
}
