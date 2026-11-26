using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Tenants;

/// <summary>An account as the platform's list shows it.</summary>
/// <param name="HomeName">The space the account lives in: their company, or their personal space.</param>
/// <param name="SpaceCount">How many spaces they can open, their own included.</param>
public record AdminUserDto(
    Guid Id,
    string Email,
    string FirstName,
    string LastName,
    string Role,
    Guid? HomeTenantId,
    string? HomeName,
    string? HomeKind,
    int SpaceCount,
    DateTimeOffset CreatedAt);

/// <summary>
/// Every account on the platform, for the super admin: to find one, and to delete one.
/// </summary>
[ApiController]
[Route("api/admin/utilisateurs")]
[Authorize(Roles = Roles.Platform)]
public class AdminUsersController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<AdminUserDto>>> List([FromQuery] PagingQuery query, CancellationToken ct)
    {
        var users = db.Users.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var needle = query.Search.Trim().ToLower();
            users = users.Where(u =>
                u.Email!.ToLower().Contains(needle)
                || (u.FirstName + " " + u.LastName).ToLower().Contains(needle));
        }

        var total = await users.CountAsync(ct);
        var items = await users
            .OrderByDescending(u => u.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(u => new AdminUserDto(
                u.Id,
                u.Email ?? "",
                u.FirstName,
                u.LastName,
                u.Role.ToString(),
                u.TenantId,
                u.Tenant == null ? null : u.Tenant.Name,
                u.Tenant == null ? null : u.Tenant.Kind.ToString(),
                db.TenantMemberships.Count(m => m.UserId == u.Id),
                u.CreatedAt))
            .ToListAsync(ct);

        return Ok(new PagedResult<AdminUserDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total });
    }

    /// <summary>
    /// Deletes an account, and the personal space that is theirs alone.
    ///
    /// What they did inside companies stays: the employee file, the client file, the hours —
    /// those belong to the company, and they lose only the link to a login that no longer exists.
    /// The founder of a company is refused, because the company would be left with nobody able
    /// to run it; that is deleting the company, which is its own button with its own warning.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (id == currentUser.UserId) return BadRequest(new { message = "Vous ne pouvez pas supprimer votre propre compte." });

        var user = await db.Users.Include(u => u.Tenant).FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NotFound(new { message = "Ce compte n'existe plus." });

        if (user.Role is UserRole.SuperAdmin)
            return BadRequest(new { message = "Un compte super administrateur ne se supprime pas d'ici." });

        if (user.Tenant is { Kind: TenantKind.Business } company && user.Role == UserRole.TenantAdmin)
        {
            return Conflict(new
            {
                message = $"Ce compte a fondé « {company.Name} ». Supprimez l'entreprise dans Locataires, ce qui supprime aussi ce compte."
            });
        }

        // An order keeps who placed it, and that link refuses to be cut.
        if (await db.CustomerOrders.IgnoreQueryFilters().AnyAsync(o => o.PlacedByUserId == id, ct))
        {
            return Conflict(new { message = "Ce compte a passé des commandes chez une entreprise, qui doivent rester à son nom." });
        }

        var personal = user.Tenant is { Kind: TenantKind.Personal } home ? home.Id : (Guid?)null;
        db.ChangeTracker.Clear();

        var strategy = db.Database.CreateExecutionStrategy();
        try
        {
            await strategy.ExecuteAsync(async () =>
            {
                await using var transaction = await db.Database.BeginTransactionAsync(ct);

                // The personal space is theirs alone; it goes with them.
                if (personal is { } space) await TenantEraser.EraseAsync(db, space, ct);

                // Memberships, logins and roles cascade; employee, client and contact files keep
                // their record and lose the account.
                await db.Users.Where(u => u.Id == id).ExecuteDeleteAsync(ct);

                await transaction.CommitAsync(ct);
            });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }

        return NoContent();
    }
}
