using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Clients;

[ApiController]
[Route("api/clients")]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public class ClientsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<ClientDto>>> List([FromQuery] PagingQuery query)
    {
        var clients = db.Clients.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            clients = clients.Where(c => c.Name.Contains(query.Search) || (c.Email != null && c.Email.Contains(query.Search)));
        }

        var totalCount = await clients.CountAsync();

        var items = await clients
            .OrderBy(c => c.Name)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(ToDto())
            .ToListAsync();

        return Ok(new PagedResult<ClientDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpGet("summary")]
    public async Task<ActionResult<List<ClientSummaryDto>>> Summary()
    {
        var items = await db.Clients.AsNoTracking()
            .OrderBy(c => c.Name)
            .Select(c => new ClientSummaryDto(c.Id, c.Name, c.Email))
            .ToListAsync();
        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ClientDto>> Get(Guid id)
    {
        var client = await GetDtoAsync(id);
        return client is null ? NotFound() : Ok(client);
    }

    private Task<ClientDto?> GetDtoAsync(Guid id) =>
        db.Clients.AsNoTracking().Where(c => c.Id == id).Select(ToDto()).FirstOrDefaultAsync();

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ClientDto>> Create(UpsertClientRequest request)
    {
        var client = new Client
        {
            TenantId = currentUser.TenantId!.Value,
            Name = request.Name.Trim(),
            Email = request.Email,
            Phone = request.Phone,
            TaxId = request.TaxId,
            Notes = request.Notes
        };

        db.Clients.Add(client);
        await db.SaveChangesAsync();

        var dto = new ClientDto(client.Id, client.Name, client.Email, client.Phone, client.TaxId, client.Notes, 0, 0, 0, client.CreatedAt, client.UpdatedAt);
        return CreatedAtAction(nameof(Get), new { id = client.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ClientDto>> Update(Guid id, UpsertClientRequest request)
    {
        var client = await db.Clients.FirstOrDefaultAsync(c => c.Id == id);
        if (client is null) return NotFound();

        client.Name = request.Name.Trim();
        client.Email = request.Email;
        client.Phone = request.Phone;
        client.TaxId = request.TaxId;
        client.Notes = request.Notes;
        client.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var client = await db.Clients.FirstOrDefaultAsync(c => c.Id == id);
        if (client is null) return NotFound();

        db.Clients.Remove(client);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static System.Linq.Expressions.Expression<Func<Client, ClientDto>> ToDto() => c => new ClientDto(
        c.Id, c.Name, c.Email, c.Phone, c.TaxId, c.Notes,
        c.Addresses.Count, c.Projects.Count, c.Invoices.Count,
        c.CreatedAt, c.UpdatedAt);
}
