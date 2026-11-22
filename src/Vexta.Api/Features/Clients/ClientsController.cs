using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Clients;

[ApiController]
[Route("api/clients")]
[StaffOnly]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public class ClientsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IClientAccessService access) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<ClientDto>>> List([FromQuery] PagingQuery query)
    {
        var clients = db.Clients.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search;
            clients = clients.Where(c =>
                c.Name.Contains(search)
                || (c.CompanyName != null && c.CompanyName.Contains(search))
                || (c.FirstName != null && c.FirstName.Contains(search))
                || (c.LastName != null && c.LastName.Contains(search))
                || (c.Email != null && c.Email.Contains(search)));
        }

        var totalCount = await clients.CountAsync();

        var items = await clients
            .OrderByDescending(c => c.Number)
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
            .Select(c => new ClientSummaryDto(c.Id, c.Number, c.Name, c.Email))
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
        if (Validate(request) is { } error) return BadRequest(new { message = error });

        var tenantId = currentUser.TenantId!.Value;

        var client = new Client
        {
            TenantId = tenantId,
            Number = await NextNumberAsync(tenantId),
            Type = request.Type,
            CompanyName = Clean(request.CompanyName),
            FirstName = Clean(request.FirstName),
            LastName = Clean(request.LastName),
            Name = DisplayNameFor(request),
            Email = Clean(request.Email),
            Phone = Clean(request.Phone),
            TaxId = Clean(request.TaxId),
            Notes = Clean(request.Notes),
            IsTaxExempt = request.IsTaxExempt
        };

        db.Clients.Add(client);
        ApplyPrimaryAddress(client, request.PrimaryAddress, tenantId);

        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = client.Id }, await GetDtoAsync(client.Id));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ClientDto>> Update(Guid id, UpsertClientRequest request)
    {
        var client = await db.Clients.Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == id);
        if (client is null) return NotFound();
        if (Validate(request) is { } error) return BadRequest(new { message = error });

        // The address is the sign-in name once access exists, so changing it here would leave
        // them signing in with one address and listed under another. Same for the type: a
        // particulier who becomes an entreprise has nobody left to be the account holder.
        if (client.UserId is not null)
        {
            if (!string.Equals(Clean(request.Email), client.Email, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "Retirez l'accès avant de changer le courriel." });
            }

            if (request.Type != client.Type)
            {
                return BadRequest(new { message = "Retirez l'accès avant de changer le type de client." });
            }
        }

        client.Type = request.Type;
        client.CompanyName = Clean(request.CompanyName);
        client.FirstName = Clean(request.FirstName);
        client.LastName = Clean(request.LastName);
        client.Name = DisplayNameFor(request);
        client.Email = Clean(request.Email);
        client.Phone = Clean(request.Phone);
        client.TaxId = Clean(request.TaxId);
        client.Notes = Clean(request.Notes);
        client.IsTaxExempt = request.IsTaxExempt;
        client.UpdatedAt = DateTimeOffset.UtcNow;

        ApplyPrimaryAddress(client, request.PrimaryAddress, client.TenantId);

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

    // ---- Contacts ----

    [HttpGet("{id:guid}/contacts")]
    public async Task<ActionResult<List<ClientContactDto>>> Contacts(Guid id)
    {
        if (!await db.Clients.AnyAsync(c => c.Id == id)) return NotFound();

        var items = await db.ClientContacts.AsNoTracking()
            .Where(c => c.ClientId == id)
            .OrderBy(c => c.LastName).ThenBy(c => c.FirstName)
            .Select(ContactToDto())
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost("{id:guid}/contacts")]
    [RequireBusinessTenant]
    public async Task<ActionResult<ClientContactDto>> CreateContact(Guid id, UpsertClientContactRequest request)
    {
        if (!await db.Clients.AnyAsync(c => c.Id == id)) return NotFound();
        if (ValidateContact(request) is { } error) return BadRequest(new { message = error });

        var contact = new ClientContact
        {
            TenantId = currentUser.TenantId!.Value,
            ClientId = id,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Role = Clean(request.Role),
            Email = Clean(request.Email),
            Phone = Clean(request.Phone),
            Notes = Clean(request.Notes)
        };

        db.ClientContacts.Add(contact);
        await db.SaveChangesAsync();

        return Ok(ToContactDto(contact));
    }

    [HttpPut("{id:guid}/contacts/{contactId:guid}")]
    public async Task<ActionResult<ClientContactDto>> UpdateContact(Guid id, Guid contactId, UpsertClientContactRequest request)
    {
        var contact = await db.ClientContacts.FirstOrDefaultAsync(c => c.Id == contactId && c.ClientId == id);
        if (contact is null) return NotFound();
        if (ValidateContact(request) is { } error) return BadRequest(new { message = error });

        if (contact.UserId is not null
            && !string.Equals(Clean(request.Email), contact.Email, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Retirez l'accès avant de changer le courriel." });
        }

        contact.FirstName = request.FirstName.Trim();
        contact.LastName = request.LastName.Trim();
        contact.Role = Clean(request.Role);
        contact.Email = Clean(request.Email);
        contact.Phone = Clean(request.Phone);
        contact.Notes = Clean(request.Notes);
        contact.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Ok(ToContactDto(contact));
    }

    [HttpDelete("{id:guid}/contacts/{contactId:guid}")]
    public async Task<IActionResult> DeleteContact(Guid id, Guid contactId)
    {
        var contact = await db.ClientContacts.FirstOrDefaultAsync(c => c.Id == contactId && c.ClientId == id);
        if (contact is null) return NotFound();

        db.ClientContacts.Remove(contact);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ---- Access to their own file ----

    /// <summary>
    /// Opens the portal to a particulier. An entreprise is a company and has nobody to be: its
    /// people are its contacts, and each of them is invited in their own right.
    /// </summary>
    [HttpPost("{id:guid}/acces")]
    [RequireBusinessTenant]
    public Task<ActionResult<ClientAccessGrantedDto>> GrantClientAccess(Guid id, CancellationToken ct) =>
        GrantAsync(
            () => db.Clients.FirstOrDefaultAsync(c => c.Id == id && c.Type == ClientType.Particulier, ct),
            client => client.Id, ct);

    [HttpPost("{id:guid}/acces/renvoyer")]
    [RequireBusinessTenant]
    public Task<ActionResult<ClientAccessGrantedDto>> ResendClientAccess(Guid id, CancellationToken ct) =>
        ResendAsync(() => db.Clients.FirstOrDefaultAsync(c => c.Id == id, ct), ct);

    [HttpDelete("{id:guid}/acces")]
    public Task<IActionResult> RevokeClientAccess(Guid id, CancellationToken ct) =>
        RevokeAsync(() => db.Clients.FirstOrDefaultAsync(c => c.Id == id, ct), ct);

    [HttpPost("{id:guid}/contacts/{contactId:guid}/acces")]
    [RequireBusinessTenant]
    public Task<ActionResult<ClientAccessGrantedDto>> GrantContactAccess(Guid id, Guid contactId, CancellationToken ct) =>
        GrantAsync(
            () => db.ClientContacts.FirstOrDefaultAsync(c => c.Id == contactId && c.ClientId == id, ct),
            contact => contact.ClientId, ct);

    [HttpPost("{id:guid}/contacts/{contactId:guid}/acces/renvoyer")]
    [RequireBusinessTenant]
    public Task<ActionResult<ClientAccessGrantedDto>> ResendContactAccess(Guid id, Guid contactId, CancellationToken ct) =>
        ResendAsync(() => db.ClientContacts.FirstOrDefaultAsync(c => c.Id == contactId && c.ClientId == id, ct), ct);

    [HttpDelete("{id:guid}/contacts/{contactId:guid}/acces")]
    public Task<IActionResult> RevokeContactAccess(Guid id, Guid contactId, CancellationToken ct) =>
        RevokeAsync(() => db.ClientContacts.FirstOrDefaultAsync(c => c.Id == contactId && c.ClientId == id, ct), ct);

    /// <summary>
    /// The three access endpoints differ only in which row they load and which client the scope
    /// is taken from, so the rest is written once. Everything a customer may see follows from
    /// that scope, which is why it is read from the record and never from the request.
    /// </summary>
    private async Task<ActionResult<ClientAccessGrantedDto>> GrantAsync<T>(
        Func<Task<T?>> load, Func<T, Guid> scopeOf, CancellationToken ct) where T : class, IInvitable
    {
        var target = await load();
        if (target is null) return NotFound();

        var (grant, error) = await access.GrantAsync(target, scopeOf(target), ct);
        if (grant is null) return BadRequest(new { message = error });

        await db.SaveChangesAsync(ct);
        return Ok(new ClientAccessGrantedDto(grant.InvitationUrl, grant.ExpiresAt, grant.EmailSent));
    }

    private async Task<ActionResult<ClientAccessGrantedDto>> ResendAsync<T>(
        Func<Task<T?>> load, CancellationToken ct) where T : class, IInvitable
    {
        var target = await load();
        if (target is null) return NotFound();

        var (grant, error) = await access.ResendAsync(target, ct);
        if (grant is null) return BadRequest(new { message = error });

        await db.SaveChangesAsync(ct);
        return Ok(new ClientAccessGrantedDto(grant.InvitationUrl, grant.ExpiresAt, grant.EmailSent));
    }

    private async Task<IActionResult> RevokeAsync<T>(
        Func<Task<T?>> load, CancellationToken ct) where T : class, IInvitable
    {
        var target = await load();
        if (target is null) return NotFound();

        await access.RevokeAsync(target, ct);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Helpers ----

    /// <summary>
    /// Max + 1, not count + 1: deleting a client must not hand its number to the next one.
    /// The unique index is what makes a simultaneous creation fail rather than collide silently.
    /// </summary>
    private async Task<int> NextNumberAsync(Guid tenantId)
    {
        var highest = await db.Clients.IgnoreQueryFilters()
            .Where(c => c.TenantId == tenantId)
            .MaxAsync(c => (int?)c.Number) ?? 0;
        return highest + 1;
    }

    /// <summary>
    /// The form's address fields are the client's primary address, stored in the Addresses table
    /// like every other one. Writing them to columns on Client as well would be two places to
    /// read and two places to get wrong.
    /// </summary>
    private void ApplyPrimaryAddress(Client client, ClientAddressDto? input, Guid tenantId)
    {
        if (input is null || string.IsNullOrWhiteSpace(input.Line1)) return;

        var existing = client.Addresses.FirstOrDefault(a => a.IsPrimary);
        if (existing is null)
        {
            existing = new Address
            {
                TenantId = tenantId,
                ClientId = client.Id,
                IsPrimary = true,
                Type = AddressType.Facturation,
                Line1 = string.Empty,
                City = string.Empty,
                PostalCode = string.Empty,
                Country = string.Empty
            };
            client.Addresses.Add(existing);
        }

        existing.Line1 = input.Line1.Trim();
        existing.Line2 = Clean(input.Apartment);
        existing.City = input.City.Trim();
        existing.Province = Clean(input.Province);
        existing.PostalCode = input.PostalCode.Trim();
        existing.Country = string.IsNullOrWhiteSpace(input.Country) ? "Canada" : input.Country.Trim();
        existing.UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>The company for an entreprise, the person for a particulier.</summary>
    private static string DisplayNameFor(UpsertClientRequest r) =>
        r.Type == ClientType.Entreprise
            ? r.CompanyName!.Trim()
            : $"{r.FirstName?.Trim()} {r.LastName?.Trim()}".Trim();

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? Validate(UpsertClientRequest r)
    {
        if (r.Type == ClientType.Particulier)
        {
            // For a particulier these are the name. For an entreprise they are whoever you call
            // there, which you may simply not know yet — and requiring them made every company
            // on file without a contact impossible to save at all.
            if (string.IsNullOrWhiteSpace(r.FirstName)) return "Le prénom est obligatoire.";
            if (string.IsNullOrWhiteSpace(r.LastName)) return "Le nom est obligatoire.";
        }
        else if (string.IsNullOrWhiteSpace(r.CompanyName))
        {
            return "Le nom d'entreprise est obligatoire pour un client entreprise.";
        }

        if (r.CompanyName is { Length: > 200 }) return "Le nom d'entreprise ne peut pas dépasser 200 caractères.";
        if (r.FirstName?.Trim().Length > 100 || r.LastName?.Trim().Length > 100) return "100 caractères maximum.";

        // An address is optional, but a half-filled one is a mistake worth catching now rather
        // than discovering on an invoice.
        if (r.PrimaryAddress is { } a && !string.IsNullOrWhiteSpace(a.Line1))
        {
            if (string.IsNullOrWhiteSpace(a.City)) return "La ville est obligatoire quand une adresse est saisie.";
            if (string.IsNullOrWhiteSpace(a.PostalCode)) return "Le code postal est obligatoire quand une adresse est saisie.";
        }

        return null;
    }

    private static string? ValidateContact(UpsertClientContactRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.FirstName)) return "Le prénom est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.LastName)) return "Le nom est obligatoire.";
        if (r.FirstName.Trim().Length > 100 || r.LastName.Trim().Length > 100) return "100 caractères maximum.";
        return null;
    }

    private static System.Linq.Expressions.Expression<Func<Client, ClientDto>> ToDto() => c => new ClientDto(
        c.Id,
        c.Number,
        c.Type.ToString(),
        c.CompanyName,
        c.FirstName,
        c.LastName,
        c.Name,
        c.Email,
        c.Phone,
        c.TaxId,
        c.Notes,
        c.IsTaxExempt,
        c.Addresses
            .Where(a => a.IsPrimary)
            .Select(a => new ClientAddressDto(a.Id, a.Line1, a.Line2, a.City, a.Province, a.PostalCode, a.Country))
            .FirstOrDefault(),
        c.Addresses.Count,
        c.Contacts.Count,
        c.Projects.Count,
        c.Invoices.Count,
        new ClientAccessDto(
            c.UserId != null,
            c.InvitationTokenHash != null && c.InvitationExpiresAt > DateTimeOffset.UtcNow,
            c.InvitationExpiresAt,
            c.InvitationSentAt),
        c.CreatedAt,
        c.UpdatedAt);

    private static System.Linq.Expressions.Expression<Func<ClientContact, ClientContactDto>> ContactToDto() =>
        c => new ClientContactDto(
            c.Id, c.ClientId, c.FirstName, c.LastName, c.Role, c.Email, c.Phone, c.Notes,
            new ClientAccessDto(
                c.UserId != null,
                c.InvitationTokenHash != null && c.InvitationExpiresAt > DateTimeOffset.UtcNow,
                c.InvitationExpiresAt,
                c.InvitationSentAt),
            c.CreatedAt);

    private static ClientContactDto ToContactDto(ClientContact c) =>
        new(c.Id, c.ClientId, c.FirstName, c.LastName, c.Role, c.Email, c.Phone, c.Notes, AccessOf(c), c.CreatedAt);

    private static ClientAccessDto AccessOf(IInvitable target) => new(
        target.UserId is not null,
        target.InvitationTokenHash is not null && target.InvitationExpiresAt > DateTimeOffset.UtcNow,
        target.InvitationExpiresAt,
        target.InvitationSentAt);
}
