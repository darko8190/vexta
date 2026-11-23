using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Clients;

/// <summary>
/// The things one client owns that work gets done on: the cars at a garage, the buildings for a
/// contractor, the furnaces for a refrigeration shop.
///
/// Readable by a customer looking at their own file — these are their own vehicles, and the
/// query filter already narrows the rows to theirs — and written by the people who run the
/// company. An employee reads them; a customer must not be able to add a car to their file.
/// </summary>
[ApiController]
[Route("api/clients/{clientId:guid}/actifs")]
[Authorize(Roles = Roles.StaffAndClients)]
[RequireActiveSubscription]
public class ClientAssetsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ClientAssetDto>>> List(
        Guid clientId, [FromQuery] bool inactifs, CancellationToken ct)
    {
        if (!await db.Clients.AnyAsync(c => c.Id == clientId, ct)) return NotFound();

        var query = db.ClientAssets.AsNoTracking()
            .Include(a => a.Address)
            .Include(a => a.AssetType)
            .Where(a => a.ClientId == clientId);

        // Retired assets are kept but hidden: a shop that has serviced the same client for ten
        // years would otherwise open on a list of cars they no longer own.
        if (!inactifs) query = query.Where(a => a.IsActive);

        // Grouped by kind before anything else: a property manager with nine buildings and two
        // trucks reads the list by kind, and a garage with only vehicles sees no difference.
        var assets = await query
            .OrderByDescending(a => a.IsActive)
            .ThenBy(a => a.AssetType!.Name)
            .ThenBy(a => a.Label)
            .ToListAsync(ct);

        return Ok(assets.Select(Map).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ClientAssetDto>> Get(Guid clientId, Guid id, CancellationToken ct)
    {
        var asset = await LoadAsync(clientId, id, ct);
        return asset is null ? NotFound() : Ok(Map(asset));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<ClientAssetDto>> Create(
        Guid clientId, SaveClientAssetRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == clientId, ct);
        if (client is null) return NotFound();

        // A barred client gets no new work and no new things to do it on. Adding a car to a file
        // we have closed is the first half of taking a job we have refused.
        if (client.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        if (await UnknownAddressAsync(clientId, request.AddressId, ct))
        {
            return BadRequest(new { message = AddressMissing });
        }
        if (await UnknownTypeAsync(request.AssetTypeId, ct)) return BadRequest(new { message = TypeMissing });

        var asset = new ClientAsset
        {
            TenantId = tenantId,
            ClientId = clientId,
            Label = request.Label.Trim(),
            AssetTypeId = request.AssetTypeId,
            Make = Clean(request.Make),
            Model = Clean(request.Model),
            Year = request.Year,
            SerialNumber = Clean(request.SerialNumber),
            Reference = Clean(request.Reference),
            Usage = request.Usage,
            UsageUnit = Clean(request.UsageUnit),
            AddressId = request.AddressId,
            Notes = Clean(request.Notes),
            IsActive = request.IsActive
        };

        db.ClientAssets.Add(asset);
        await db.SaveChangesAsync(ct);

        // Re-read so the address comes back with its lines rather than as an id the list cannot
        // show.
        return Ok(Map(await LoadAsync(clientId, asset.Id, ct) ?? asset));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<ClientAssetDto>> Update(
        Guid clientId, Guid id, SaveClientAssetRequest request, CancellationToken ct)
    {
        // Matched on the client too, not on the id alone: a car on another client's file is a
        // not-found here rather than something this route will quietly rewrite.
        var asset = await LoadAsync(clientId, id, ct);
        if (asset is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        if (await UnknownAddressAsync(clientId, request.AddressId, ct))
        {
            return BadRequest(new { message = AddressMissing });
        }
        if (await UnknownTypeAsync(request.AssetTypeId, ct)) return BadRequest(new { message = TypeMissing });

        asset.Label = request.Label.Trim();
        asset.AssetTypeId = request.AssetTypeId;
        asset.Make = Clean(request.Make);
        asset.Model = Clean(request.Model);
        asset.Year = request.Year;
        asset.SerialNumber = Clean(request.SerialNumber);
        asset.Reference = Clean(request.Reference);
        asset.Usage = request.Usage;
        asset.UsageUnit = Clean(request.UsageUnit);
        asset.AddressId = request.AddressId;
        asset.Notes = Clean(request.Notes);
        asset.IsActive = request.IsActive;
        asset.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Ok(Map(await LoadAsync(clientId, id, ct) ?? asset));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid clientId, Guid id, CancellationToken ct)
    {
        var asset = await db.ClientAssets
            .FirstOrDefaultAsync(a => a.Id == id && a.ClientId == clientId, ct);
        if (asset is null) return NotFound();

        db.ClientAssets.Remove(asset);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private const string AddressMissing = "Cette adresse n'appartient pas à ce client.";
    private const string TypeMissing = "Ce type d'actif n'existe pas.";

    private Task<ClientAsset?> LoadAsync(Guid clientId, Guid id, CancellationToken ct) =>
        db.ClientAssets
            .Include(a => a.Address)
            .Include(a => a.AssetType)
            .FirstOrDefaultAsync(a => a.Id == id && a.ClientId == clientId, ct);

    /// <summary>
    /// An address has to be one of this client's own. Tenant alone would turn the field into a
    /// way of reading another client's addresses by guessing at ids.
    /// </summary>
    private async Task<bool> UnknownAddressAsync(Guid clientId, Guid? addressId, CancellationToken ct) =>
        addressId is { } id && !await db.Addresses.AnyAsync(a => a.Id == id && a.ClientId == clientId, ct);

    /// <summary>The query filter keeps this to the company's own list, so existence is enough.</summary>
    private async Task<bool> UnknownTypeAsync(Guid? typeId, CancellationToken ct) =>
        typeId is { } id && !await db.ClientAssetTypes.AnyAsync(t => t.Id == id, ct);

    private static ClientAssetDto Map(ClientAsset a) =>
        new(
            a.Id,
            a.Label,
            a.Designation,
            a.AssetTypeId,
            a.AssetType?.Name,
            a.AssetType?.Icon,
            a.Make,
            a.Model,
            a.Year,
            a.SerialNumber,
            a.Reference,
            a.Usage,
            a.UsageUnit,
            a.AddressId,
            a.Address is null ? null : AddressLine(a.Address),
            a.Notes,
            a.IsActive,
            a.CreatedAt);

    /// <summary>The address on one line, which is all a list of assets has room for.</summary>
    private static string AddressLine(Address address) =>
        string.Join(", ", new[] { address.Line1, address.City }.Where(p => !string.IsNullOrWhiteSpace(p)));

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? Problem(SaveClientAssetRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Label)) return "Le nom est obligatoire.";
        if (r.Label.Trim().Length > 200) return "Le nom ne peut pas dépasser 200 caractères.";
        if (r.Make?.Trim().Length > 80 || r.Model?.Trim().Length > 80) return "80 caractères maximum.";
        if (r.SerialNumber?.Trim().Length > 80) return "Le numéro de série est trop long.";
        if (r.Reference?.Trim().Length > 60) return "La référence est trop longue.";
        if (r.UsageUnit?.Trim().Length > 20) return "L'unité est trop longue.";
        if (r.Notes?.Trim().Length > 2000) return "Les notes sont trop longues.";

        // A model year, not a date. The lower bound keeps a typed serial number out of the
        // field; the upper one allows next year's models, which are sold this year.
        if (r.Year is { } year && (year < 1900 || year > DateTime.Now.Year + 2))
        {
            return "L'année n'est pas plausible.";
        }

        if (r.Usage is < 0) return "L'usage ne peut pas être négatif.";

        return null;
    }
}
