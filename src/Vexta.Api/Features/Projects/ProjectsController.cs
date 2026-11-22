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
            projects = projects.Where(p => p.Name.Contains(query.Search) || p.Client!.Name.Contains(query.Search));
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

        var project = new Project
        {
            TenantId = currentUser.TenantId!.Value,
            ClientId = request.ClientId,
            Name = request.Name.Trim(),
            Description = request.Description,
            Status = request.Status,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Budget = request.Budget
        };

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

        project.ClientId = request.ClientId;
        project.Name = request.Name.Trim();
        project.Description = request.Description;
        project.Status = request.Status;
        project.StartDate = request.StartDate;
        project.EndDate = request.EndDate;
        project.Budget = request.Budget;
        project.UpdatedAt = DateTimeOffset.UtcNow;

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

    private Task<ProjectDto?> GetDtoAsync(Guid id) =>
        db.Projects.AsNoTracking().Where(p => p.Id == id).Select(ToDto()).FirstOrDefaultAsync();

    private static System.Linq.Expressions.Expression<Func<Project, ProjectDto>> ToDto() => p => new ProjectDto(
        p.Id, p.ClientId, p.Client!.Name, p.Name, p.Description, p.Status,
        p.StartDate, p.EndDate, p.Budget, p.Invoices.Count, p.CreatedAt, p.UpdatedAt);
}
