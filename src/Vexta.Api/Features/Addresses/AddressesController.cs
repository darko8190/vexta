using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Addresses;

[ApiController]
[Route("api/addresses")]
[StaffOnly]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public class AddressesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<AddressDto>>> List([FromQuery] PagingQuery query, [FromQuery] Guid? clientId)
    {
        var addresses = db.Addresses.AsNoTracking().AsQueryable();

        if (clientId is not null)
        {
            addresses = addresses.Where(a => a.ClientId == clientId);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // ILike, not Contains: Contains becomes a case-sensitive LIKE on Postgres, and
            // nobody searches in the case the record was typed in.
            var pattern = $"%{query.Search.Trim()}%";

            addresses = addresses.Where(a =>
                EF.Functions.ILike(a.City, pattern)
                || EF.Functions.ILike(a.Line1, pattern)
                || EF.Functions.ILike(a.Client!.Name, pattern));
        }

        var totalCount = await addresses.CountAsync();

        var items = await addresses
            .OrderByDescending(a => a.IsPrimary).ThenBy(a => a.City)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(ToDto())
            .ToListAsync();

        return Ok(new PagedResult<AddressDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<AddressDto>> Get(Guid id)
    {
        var address = await GetDtoAsync(id);
        return address is null ? NotFound() : Ok(address);
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<AddressDto>> Create(UpsertAddressRequest request)
    {
        var clientExists = await db.Clients.AnyAsync(c => c.Id == request.ClientId);
        if (!clientExists) return BadRequest(new { message = "Client introuvable." });

        if (request.IsPrimary)
        {
            await ClearExistingPrimaryAsync(request.ClientId);
        }

        var address = new Address
        {
            TenantId = currentUser.TenantId!.Value,
            ClientId = request.ClientId,
            Type = request.Type,
            IsPrimary = request.IsPrimary,
            Line1 = request.Line1.Trim(),
            Line2 = request.Line2,
            City = request.City.Trim(),
            Province = request.Province,
            PostalCode = request.PostalCode.Trim(),
            Country = request.Country.Trim()
        };

        db.Addresses.Add(address);
        await db.SaveChangesAsync();

        var dto = await GetDtoAsync(address.Id);
        return CreatedAtAction(nameof(Get), new { id = address.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<AddressDto>> Update(Guid id, UpsertAddressRequest request)
    {
        var address = await db.Addresses.FirstOrDefaultAsync(a => a.Id == id);
        if (address is null) return NotFound();

        if (request.IsPrimary && !address.IsPrimary)
        {
            await ClearExistingPrimaryAsync(request.ClientId);
        }

        address.ClientId = request.ClientId;
        address.Type = request.Type;
        address.IsPrimary = request.IsPrimary;
        address.Line1 = request.Line1.Trim();
        address.Line2 = request.Line2;
        address.City = request.City.Trim();
        address.Province = request.Province;
        address.PostalCode = request.PostalCode.Trim();
        address.Country = request.Country.Trim();
        address.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var address = await db.Addresses.FirstOrDefaultAsync(a => a.Id == id);
        if (address is null) return NotFound();

        db.Addresses.Remove(address);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task ClearExistingPrimaryAsync(Guid clientId)
    {
        var current = await db.Addresses.Where(a => a.ClientId == clientId && a.IsPrimary).ToListAsync();
        foreach (var a in current) a.IsPrimary = false;
    }

    private Task<AddressDto?> GetDtoAsync(Guid id) =>
        db.Addresses.AsNoTracking().Where(a => a.Id == id).Select(ToDto()).FirstOrDefaultAsync();

    private static System.Linq.Expressions.Expression<Func<Address, AddressDto>> ToDto() => a => new AddressDto(
        a.Id, a.ClientId, a.Client!.Name, a.Type, a.IsPrimary,
        a.Line1, a.Line2, a.City, a.Province, a.PostalCode, a.Country,
        a.CreatedAt, a.UpdatedAt);
}
