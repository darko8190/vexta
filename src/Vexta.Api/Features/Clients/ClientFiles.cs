using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Clients;

/// <summary>
/// The customer file a Vexta account has at one company, found or opened.
///
/// For the public routes where somebody signs in to deal with a company — a form that files
/// something on their record. Read across tenants on purpose (the visitor's token is not the
/// company's), so every query names the company itself.
/// </summary>
public static class ClientFiles
{
    /// <summary>
    /// The file this account already has here, if any. Two ways to be one, both counted: the
    /// account carried on the client record, and a membership that names a client.
    /// </summary>
    public static async Task<Client?> FindForUserAsync(VextaDbContext db, Guid tenantId, Guid userId, CancellationToken ct)
    {
        var clients = db.Clients.IgnoreQueryFilters().Where(c => c.TenantId == tenantId);

        var direct = await clients.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (direct is not null) return direct;

        var membershipClientId = await db.TenantMemberships.IgnoreQueryFilters().AsNoTracking()
            .Where(m => m.UserId == userId && m.TenantId == tenantId && m.Role == UserRole.Client && m.ClientId != null)
            .Select(m => m.ClientId)
            .FirstOrDefaultAsync(ct);

        return membershipClientId is { } clientId
            ? await clients.FirstOrDefaultAsync(c => c.Id == clientId, ct)
            : null;
    }

    /// <summary>
    /// Opens a file for an account that has none here, as a prospect: they have asked for
    /// something, not bought it. Added to the context, not saved — the caller saves it with
    /// whatever it is filing on it, so the two land together or not at all.
    /// </summary>
    public static async Task<Client?> OpenForUserAsync(
        VextaDbContext db, Guid tenantId, Guid userId, string origin, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.FirstName, u.LastName, u.Email })
            .FirstOrDefaultAsync(ct);

        if (user is null) return null;

        var highest = await db.Clients.IgnoreQueryFilters()
            .Where(c => c.TenantId == tenantId)
            .MaxAsync(c => (int?)c.Number, ct) ?? 0;

        var name = $"{user.FirstName} {user.LastName}".Trim();

        var client = new Client
        {
            TenantId = tenantId,
            Number = highest + 1,
            // A person, because an account belongs to one — see the shop's own file opening.
            Type = ClientType.Particulier,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Name = name.Length > 0 ? name : user.Email ?? "Client",
            Email = user.Email,
            Status = ClientStatus.Prospect,
            Notes = $"Créé par {origin}, rempli en ligne le {BusinessDay.Today:d MMMM yyyy}.",
            // Attached straight away, so the next form they fill finds this file instead of
            // opening a second one.
            UserId = userId
        };

        db.Clients.Add(client);
        return client;
    }
}
