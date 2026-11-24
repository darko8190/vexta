using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

public interface ISupplierLinkService
{
    /// <summary>
    /// Recognises a company that has just signed up in the supplier lists its future customers
    /// already keep, and gives it those customers as clients.
    ///
    /// Returns how many suppliers were linked. Never throws: this runs at the end of a sign-up,
    /// and a company must not be refused an account because the platform could not work out who
    /// its customers are.
    /// </summary>
    Task<int> LinkOnSignupAsync(Guid tenantId, CancellationToken ct = default);
}

public class SupplierLinkService(VextaDbContext db, ILogger<SupplierLinkService> logger) : ISupplierLinkService
{
    public async Task<int> LinkOnSignupAsync(Guid tenantId, CancellationToken ct = default)
    {
        try
        {
            return await LinkCoreAsync(tenantId, ct);
        }
        catch (Exception ex)
        {
            // Logged and swallowed. The account is already created and usable; what is lost is a
            // convenience, and the company can add its clients by hand as every other one does.
            logger.LogError(ex, "Rapprochement des fournisseurs impossible pour le locataire {TenantId}.", tenantId);
            return 0;
        }
    }

    private async Task<int> LinkCoreAsync(Guid tenantId, CancellationToken ct)
    {
        var company = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => new { t.Id, t.Name, t.Kind, t.ContactEmail, t.Phone })
            .FirstOrDefaultAsync(ct);

        // A personal space is a person, not a supplier anybody ordered from, and it has no
        // address to be recognised by.
        if (company is null || company.Kind != TenantKind.Business) return 0;

        var address = await db.CompanyLocations.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.TenantId == tenantId && l.IsPrimary)
            .Select(l => new { l.Line1, l.Line2, l.City, l.Province, l.PostalCode, l.Country })
            .FirstOrDefaultAsync(ct);

        if (address is null) return 0;

        var key = CompanyIdentity.AddressKey(address.Line1, address.PostalCode);
        if (key is null) return 0;

        // Across every tenant: this is the one query in the application that deliberately looks
        // outside the caller's own company, which is why it selects nothing but what it needs to
        // decide the match.
        var candidates = await db.Suppliers.IgnoreQueryFilters()
            .Where(s => s.AddressKey == key && s.LinkedTenantId == null && s.TenantId != tenantId)
            .ToListAsync(ct);

        // The address is only half the test. Two companies at one address is ordinary -- a mall,
        // an industrial park, a landlord and its tenant -- so a pair whose names do not look
        // alike is left alone rather than linked on a coincidence.
        var matches = candidates
            .Where(s => CompanyIdentity.NamesLookAlike(s.Name, company.Name))
            .ToList();

        if (matches.Count == 0) return 0;

        var now = DateTimeOffset.UtcNow;

        foreach (var supplier in matches)
        {
            supplier.LinkedTenantId = tenantId;
            supplier.LinkedAt = now;

            // Only what was empty, and only what the company itself is the authority on. The
            // name is deliberately left as its customer typed it: "la cour à bois" is their own
            // label for this supplier, and rewriting it would look like the application changing
            // their data behind their back. Account number and notes are the relationship, not
            // the company, and are never touched.
            supplier.Email ??= company.ContactEmail;
            supplier.Phone ??= company.Phone;

            // The parts of the address the match did not already prove equal, so the two records
            // stop disagreeing about which city the same postal code is in.
            supplier.City ??= address.City;
            supplier.Province ??= address.Province;
            supplier.Country ??= address.Country;

            supplier.UpdatedAt = now;
        }

        // One client per buying company, not one per supplier row: the same company could have
        // two cards for this supplier, and the new arrival must not find its customer twice.
        var buyerIds = matches.Select(s => s.TenantId).Distinct().ToList();
        await CreateClientsAsync(tenantId, buyerIds, ct);

        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "{Count} fournisseur(s) rapproché(s) du locataire {TenantId}; {Buyers} client(s) créé(s).",
            matches.Count, tenantId, buyerIds.Count);

        return matches.Count;
    }

    /// <summary>
    /// Gives the new company the customers who had already written it down.
    ///
    /// Only the customer's own identity crosses -- its name, its address, the telephone number
    /// and address it publishes. Nothing it recorded about this supplier does: not the account
    /// number, not its notes, not an order, not a receipt. A company that writes down a supplier
    /// has disclosed who it is in order to be delivered to and invoiced; it has not agreed to
    /// show its own files to anybody.
    /// </summary>
    private async Task CreateClientsAsync(Guid tenantId, List<Guid> buyerIds, CancellationToken ct)
    {
        var buyers = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => buyerIds.Contains(t.Id) && t.Kind == TenantKind.Business)
            .Select(t => new { t.Id, t.Name, t.ContactEmail, t.Phone })
            .ToListAsync(ct);

        if (buyers.Count == 0) return;

        var locations = await db.CompanyLocations.IgnoreQueryFilters().AsNoTracking()
            .Where(l => buyerIds.Contains(l.TenantId) && l.IsPrimary)
            .ToListAsync(ct);

        var highest = await db.Clients.IgnoreQueryFilters()
            .Where(c => c.TenantId == tenantId)
            .MaxAsync(c => (int?)c.Number, ct) ?? 0;

        foreach (var buyer in buyers)
        {
            var client = new Client
            {
                TenantId = tenantId,
                Number = ++highest,
                Type = ClientType.Entreprise,
                CompanyName = buyer.Name,
                Name = buyer.Name,
                Email = buyer.ContactEmail,
                Phone = buyer.Phone,
                // Said on the card itself. A client nobody remembers creating is a client
                // somebody deletes, and the explanation has to be where the surprise is.
                Notes = "Fiche créée automatiquement : cette entreprise vous avait inscrit comme "
                    + "fournisseur sur Vexta avant votre arrivée.",
                Status = ClientStatus.Client
            };

            db.Clients.Add(client);

            if (locations.FirstOrDefault(l => l.TenantId == buyer.Id) is { } location)
            {
                db.Addresses.Add(new Address
                {
                    TenantId = tenantId,
                    ClientId = client.Id,
                    Type = AddressType.Facturation,
                    IsPrimary = true,
                    Line1 = location.Line1,
                    Line2 = location.Line2,
                    City = location.City,
                    Province = location.Province,
                    PostalCode = location.PostalCode,
                    Country = location.Country
                });
            }
        }
    }
}
