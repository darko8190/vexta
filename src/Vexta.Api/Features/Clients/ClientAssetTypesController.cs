using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Clients;

/// <summary>
/// The company's kinds of asset: Véhicule, Maison, Bloc appartements, Machinerie.
///
/// Read by anyone who can see a client's file, so the dropdown works for an employee filing a
/// car at the counter. Added to by the people who run the company — and added to from that
/// dropdown, which is why Create returns the existing row instead of a conflict when the name
/// is already on the list: somebody typing a kind that exists meant to use the one that exists.
/// </summary>
[ApiController]
[Route("api/types-actifs")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ClientAssetTypesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ClientAssetTypeDto>>> List(CancellationToken ct)
    {
        var items = await db.ClientAssetTypes.AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new ClientAssetTypeDto(t.Id, t.Name, t.Icon, t.Assets.Count))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<ClientAssetTypeDto>> Create(SaveClientAssetTypeRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();

        // Returned rather than refused: this endpoint is reached from the dropdown while
        // somebody is filing an asset, and an error here would send them hunting through a list
        // for the entry they just described.
        var existing = await db.ClientAssetTypes.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Name.ToLower() == name.ToLower(), ct);

        if (existing is not null)
        {
            return Ok(new ClientAssetTypeDto(existing.Id, existing.Name, existing.Icon, 0));
        }

        var type = new ClientAssetType
        {
            TenantId = tenantId,
            Name = name,
            Icon = Clean(request.Icon)
        };

        db.ClientAssetTypes.Add(type);
        await db.SaveChangesAsync(ct);

        return Ok(new ClientAssetTypeDto(type.Id, type.Name, type.Icon, 0));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<ClientAssetTypeDto>> Update(
        Guid id, SaveClientAssetTypeRequest request, CancellationToken ct)
    {
        var type = await db.ClientAssetTypes.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (type is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var name = request.Name.Trim();
        if (await db.ClientAssetTypes.AnyAsync(t => t.Id != id && t.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Un type porte déjà ce nom." });
        }

        type.Name = name;
        type.Icon = Clean(request.Icon);
        await db.SaveChangesAsync(ct);

        var count = await db.ClientAssets.CountAsync(a => a.AssetTypeId == id, ct);
        return Ok(new ClientAssetTypeDto(type.Id, type.Name, type.Icon, count));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var type = await db.ClientAssetTypes.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (type is null) return NotFound();

        // Refused with the count rather than cascading: the assets would lose the field that
        // says what they are, and nobody would be able to put it back.
        var inUse = await db.ClientAssets.CountAsync(a => a.AssetTypeId == id, ct);
        if (inUse > 0)
        {
            return Conflict(new
            {
                message = inUse == 1
                    ? "Un actif utilise ce type. Changez-le d'abord."
                    : $"{inUse} actifs utilisent ce type. Changez-les d'abord."
            });
        }

        db.ClientAssetTypes.Remove(type);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? Problem(SaveClientAssetTypeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Le nom du type est obligatoire.";
        if (request.Name.Trim().Length > 100) return "Le nom du type est trop long.";
        if (request.Icon?.Trim().Length > 40) return "Le nom de l'icône est trop long.";
        return null;
    }
}
