using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Sends;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Purchasing;

/// <summary>
/// Who the company buys from.
///
/// Readable by anyone on staff, because somebody picking up material needs the phone number;
/// written by the people who run the business, because the account number on this card is what
/// purchases get charged against.
/// </summary>
[ApiController]
[Route("api/fournisseurs")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class SuppliersController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IMailgunService mail,
    IConfiguration configuration) : ControllerBase
{
    private string frontendUrl => configuration["Frontend:BaseUrl"] ?? "http://localhost:3000";

    /// <param name="recherche">Matches the name, the contact, or the account number.</param>
    /// <param name="inactifs">True also returns the ones that have been put aside.</param>
    [HttpGet]
    public async Task<ActionResult<List<SupplierDto>>> List(
        [FromQuery] string? recherche, [FromQuery] bool inactifs, CancellationToken ct)
    {
        var query = db.Suppliers.AsNoTracking().AsQueryable();

        if (!inactifs) query = query.Where(s => s.IsActive);

        if (!string.IsNullOrWhiteSpace(recherche))
        {
            var term = recherche.Trim().ToLower();
            query = query.Where(s =>
                s.Name.ToLower().Contains(term)
                || (s.ContactName != null && s.ContactName.ToLower().Contains(term))
                || (s.AccountNumber != null && s.AccountNumber.ToLower().Contains(term)));
        }

        var items = await query.OrderBy(s => s.Name).Select(Projection()).ToListAsync(ct);
        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SupplierDto>> Get(Guid id, CancellationToken ct)
    {
        var supplier = await db.Suppliers.AsNoTracking().Where(s => s.Id == id).Select(Projection()).FirstOrDefaultAsync(ct);
        return supplier is null ? NotFound() : Ok(supplier);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<SupplierDto>> Create(SaveSupplierRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Validate(request, required: true) is { } error) return BadRequest(new { message = error });

        var name = request.Name.Trim();

        // Refused rather than merged: two suppliers with the same name are usually two branches
        // of the same yard, and the person adding the second one has to say which it is.
        if (await db.Suppliers.AnyAsync(s => s.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Un fournisseur porte déjà ce nom." });
        }

        var supplier = new Supplier
        {
            TenantId = tenantId,
            Name = name,
            ContactName = Clean(request.ContactName),
            Email = Clean(request.Email),
            Phone = Clean(request.Phone),
            Website = Clean(request.Website),
            AccountNumber = Clean(request.AccountNumber),
            Line1 = Clean(request.Line1),
            City = Clean(request.City),
            Province = Clean(request.Province),
            PostalCode = Clean(request.PostalCode),
            Country = Clean(request.Country),
            Notes = Clean(request.Notes),
            IsActive = request.IsActive
        };

        // Written here and in the update below, the only two places a supplier is saved, so the
        // key can never disagree with the address beside it.
        supplier.AddressKey = CompanyIdentity.AddressKey(supplier.Line1, supplier.PostalCode);

        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync(ct);

        return Ok(await DtoAsync(supplier.Id, ct));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<SupplierDto>> Update(Guid id, SaveSupplierRequest request, CancellationToken ct)
    {
        var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (supplier is null) return NotFound();

        // A card that already has an address may not be emptied of it; one that never had one
        // can still be edited without being completed first.
        var required = !string.IsNullOrWhiteSpace(supplier.Line1) || AnyAddress(request);
        if (Validate(request, required) is { } error) return BadRequest(new { message = error });

        var name = request.Name.Trim();
        if (await db.Suppliers.AnyAsync(s => s.Id != id && s.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Un fournisseur porte déjà ce nom." });
        }

        supplier.Name = name;
        supplier.ContactName = Clean(request.ContactName);
        supplier.Email = Clean(request.Email);
        supplier.Phone = Clean(request.Phone);
        supplier.Website = Clean(request.Website);
        supplier.AccountNumber = Clean(request.AccountNumber);
        supplier.Line1 = Clean(request.Line1);
        supplier.City = Clean(request.City);
        supplier.Province = Clean(request.Province);
        supplier.PostalCode = Clean(request.PostalCode);
        supplier.Country = Clean(request.Country);
        supplier.Notes = Clean(request.Notes);
        supplier.IsActive = request.IsActive;
        supplier.AddressKey = CompanyIdentity.AddressKey(supplier.Line1, supplier.PostalCode);
        supplier.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(await DtoAsync(id, ct));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (supplier is null) return NotFound();

        // Refused with the count, and the message says what to do instead: the orders are the
        // record of money that left, and they have to keep saying where it went.
        var orders = await db.PurchaseOrders.CountAsync(o => o.SupplierId == id, ct);
        if (orders > 0)
        {
            return Conflict(new
            {
                message = orders == 1
                    ? "Une commande est rattachée à ce fournisseur. Rendez-le inactif plutôt que de le supprimer."
                    : $"{orders} commandes sont rattachées à ce fournisseur. Rendez-le inactif plutôt que de le supprimer."
            });
        }

        db.Suppliers.Remove(supplier);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Companies already on Vexta, offered while a supplier is being added, so the one being
    /// written down can be picked instead of typed.
    ///
    /// Two deliberate limits. Only companies that have **published their public page** appear:
    /// that page already carries their name and address at /e/{slug} for anyone on the internet,
    /// so offering it here discloses nothing new -- whereas listing every company on Vexta would
    /// hand each of them a directory of all the others. And it is a search, never a browse: two
    /// characters minimum, ten results, nothing for an empty query. You can confirm a company you
    /// already know of; you cannot walk the list.
    /// </summary>
    /// <param name="q">At least two characters of the company's name.</param>
    [HttpGet("annuaire")]
    public async Task<ActionResult<List<SupplierDirectoryEntryDto>>> Directory(
        [FromQuery] string? q, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var needle = CompanyIdentity.Normalize(q);
        if (needle.Length < 2) return Ok(new List<SupplierDirectoryEntryDto>());

        // Filtered in memory rather than in SQL because the comparison has to ignore accents:
        // somebody typing "beton" is looking for Béton, and neither ILIKE nor LIKE will see that
        // without an extension this deployment cannot be assumed to have. The set is bounded to
        // the companies that published a page, which is a small fraction of them; the cap is
        // what keeps that assumption from becoming a slow query if it ever stops being true, and
        // the fix at that point is a stored normalised name with an index on it.
        var published = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id != tenantId && t.Kind == TenantKind.Business)
            .Join(
                db.PublicPages.IgnoreQueryFilters().AsNoTracking().Where(p => p.IsPublished),
                t => t.Id,
                p => p.TenantId,
                (t, _) => new { t.Id, t.Name, t.Slug, t.ContactEmail, t.Phone })
            .OrderBy(t => t.Name)
            .Take(500)
            .ToListAsync(ct);

        var matches = published
            .Where(t => CompanyIdentity.Normalize(t.Name).Contains(needle, StringComparison.Ordinal))
            .Take(10)
            .ToList();

        if (matches.Count == 0) return Ok(new List<SupplierDirectoryEntryDto>());

        var ids = matches.Select(m => m.Id).ToList();
        var locations = await db.CompanyLocations.IgnoreQueryFilters().AsNoTracking()
            .Where(l => ids.Contains(l.TenantId) && l.IsPrimary)
            .ToListAsync(ct);

        return Ok(matches
            .Select(m =>
            {
                var location = locations.FirstOrDefault(l => l.TenantId == m.Id);
                return new SupplierDirectoryEntryDto(
                    m.Name, m.ContactEmail, m.Phone,
                    location?.Line1, location?.City, location?.Province,
                    location?.PostalCode, location?.Country, m.Slug);
            })
            .ToList());
    }

    /// <summary>
    /// Emails a supplier an invitation to open their own space on Vexta.
    ///
    /// Not an account on this company's space: there is nothing here for a supplier to sign into,
    /// and handing them a login would imply access they do not have. This is a message saying the
    /// platform exists, sent in the company's own name.
    ///
    /// A supplier already on Vexta cannot be invited -- that would be telling somebody about a
    /// thing they are already using.
    /// </summary>
    [HttpPost("{id:guid}/invitation")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<SupplierDto>> Invite(
        Guid id, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (supplier is null) return NotFound();

        if (supplier.LinkedTenantId is not null)
        {
            return BadRequest(new { message = "Ce fournisseur est déjà sur Vexta." });
        }

        if (string.IsNullOrWhiteSpace(supplier.Email))
        {
            return BadRequest(new { message = "Ajoutez un courriel à ce fournisseur avant de l'inviter." });
        }

        // One a day at most. An invitation is a message to somebody who did not ask for it, and
        // a button that can be pressed twenty times is a button that will be.
        if (supplier.InvitationSentAt is { } sent && DateTimeOffset.UtcNow - sent < TimeSpan.FromDays(1))
        {
            return BadRequest(new { message = "Une invitation a déjà été envoyée aujourd'hui." });
        }

        var company = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => new { t.Name, t.BrandColor })
            .FirstAsync(ct);
        var companyName = company.Name;

        try
        {
            await mail.SendAsync(
                supplier.Email!,
                supplier.ContactName ?? supplier.Name,
                $"{companyName} vous invite sur Vexta",
                SupplierInvitationEmail.Build(companyName, supplier.Name, frontendUrl, company.BrandColor),
                ct,
                // From the company's own name, not ours: the supplier knows them and does not
                // know us, and an invitation from a stranger is an invitation nobody opens.
                fromName: companyName);
        }
        catch (InvalidOperationException ex)
        {
            // Mailgun is unconfigured or refused the message. Said plainly rather than recorded
            // as sent: a date written here would leave somebody waiting for an email that was
            // never going to arrive.
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }

        SendHistory.Add(db, tenantId, "fournisseur", supplier.Id, "Invitation",
            supplier.Email!, $"{companyName} vous invite sur Vexta", null, currentUser.UserId,
            await SendHistory.NameOfAsync(db, currentUser.UserId, ct));

        supplier.InvitationSentAt = DateTimeOffset.UtcNow;
        supplier.UpdatedAt = supplier.InvitationSentAt.Value;
        await db.SaveChangesAsync(ct);

        return Ok(await DtoAsync(id, ct));
    }

    // ---- Helpers ----

    private async Task<SupplierDto> DtoAsync(Guid id, CancellationToken ct) =>
        await db.Suppliers.AsNoTracking().Where(s => s.Id == id).Select(Projection()).FirstAsync(ct);

    private static System.Linq.Expressions.Expression<Func<Supplier, SupplierDto>> Projection() =>
        s => new SupplierDto(
            s.Id,
            s.Name,
            s.ContactName,
            s.Email,
            s.Phone,
            s.Website,
            s.AccountNumber,
            s.Line1,
            s.City,
            s.Province,
            s.PostalCode,
            s.Country,
            s.Notes,
            s.IsActive,
            s.LinkedTenantId != null,
            s.LinkedAt,
            s.InvitationSentAt,
            s.Orders.Count,
            s.Orders.Count(o => o.Status == PurchaseOrderStatus.Envoyee
                             || o.Status == PurchaseOrderStatus.PartiellementRecue));

    /// <summary>
    /// The address is required, because it is what a supplier is recognised by when it signs up
    /// on Vexta itself -- an incomplete one simply never matches, and a supplier added without
    /// one is a supplier that can never be connected.
    ///
    /// <paramref name="required"/> is false only for a card that already had no address: an
    /// office correcting a telephone number on a supplier added years ago must not be stopped
    /// and made to go and find a postal code first.
    /// </summary>
    private static string? Validate(SaveSupplierRequest r, bool required)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return "Le nom du fournisseur est obligatoire.";

        if (!required) return null;

        if (string.IsNullOrWhiteSpace(r.Line1)) return "L'adresse du fournisseur est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.City)) return "La ville est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.PostalCode)) return "Le code postal est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.Country)) return "Le pays est obligatoire.";

        return null;
    }

    /// <summary>True when the request carries any part of an address.</summary>
    private static bool AnyAddress(SaveSupplierRequest r) =>
        !string.IsNullOrWhiteSpace(r.Line1)
        || !string.IsNullOrWhiteSpace(r.City)
        || !string.IsNullOrWhiteSpace(r.PostalCode);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
