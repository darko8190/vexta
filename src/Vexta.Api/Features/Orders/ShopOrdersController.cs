using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;

namespace Vexta.Api.Features.Orders;

/// <summary>
/// Ordering from a company's public page.
///
/// Its own controller rather than an action on the anonymous one, because a class marked
/// <c>AllowAnonymous</c> wins over an action marked <c>Authorize</c>: an authenticated endpoint
/// cannot live inside it, and putting it there would produce exactly the opposite of what was
/// intended, silently. The same reason <see cref="Public.JobApplicationsController"/> stands apart.
///
/// Ordering needs an account, unlike filling in a form. Not a hurdle for its own sake: an order
/// is a commitment both ways — the company will pick it, the customer will collect and pay for
/// it — and both sides need to know who the other is. It is also the only thing that makes
/// "Mes commandes" possible, and a customer of four suppliers who cannot see what they ordered
/// is back to searching their e-mail.
///
/// Prices are never taken from the caller. The basket sends product ids and quantities; what
/// they cost is read from the catalogue here. A caller that could name a price would name its
/// own, and the order is the document the invoice is drawn from.
/// </summary>
[ApiController]
[Route("api/boutique")]
[Authorize]
public class ShopOrdersController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>
    /// Whether this account may order here, and under what name.
    ///
    /// Read before the basket offers its button, so somebody is told what is in the way instead
    /// of being refused after writing a delivery note.
    /// </summary>
    [HttpGet("admissibilite")]
    public async Task<ActionResult<OrderEligibilityDto>> Eligibility(
        [FromQuery] string slug, CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        var shop = await ShopGate.ResolveAsync(db, slug, ct);
        if (shop is null) return NotFound();

        var client = await MyClientAsync(shop.TenantId, userId, ct);
        var account = await AccountAsync(userId, ct);
        if (account is null) return Forbid();

        // A blocked client is told, and told why. A door that closes without a word is one
        // nobody can explain to the person standing at the counter.
        var refusal = client?.WorkRefusal();

        return Ok(new OrderEligibilityDto(
            shop.Name,
            refusal is null,
            refusal,
            client?.Name ?? account.Name,
            client?.Email ?? account.Email,
            client?.Phone));
    }

    [HttpPost("commandes")]
    public async Task<ActionResult<PlaceOrderResultDto>> Place(
        PlaceOrderRequest request, CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        var shop = await ShopGate.ResolveAsync(db, request.Slug, ct);
        if (shop is null) return NotFound();

        var wanted = (request.Lines ?? [])
            // Two lines for one product is somebody who pressed the button twice in two places.
            // Added together rather than refused: that is what they meant.
            .GroupBy(l => l.ProductId)
            .Select(g => new { ProductId = g.Key, Quantity = g.Sum(l => l.Quantity) })
            .Where(l => l.Quantity > 0)
            .ToList();

        if (wanted.Count == 0) return BadRequest(new { message = "Votre panier est vide." });
        if (wanted.Count > 100) return BadRequest(new { message = "Cent articles par commande, c'est déjà beaucoup." });

        if (wanted.Any(l => l.Quantity > 10_000))
        {
            return BadRequest(new { message = "Une quantité de cette taille se règle par téléphone." });
        }

        // Only what this company actually put in its shop window, read with its own prices. A
        // product id that is not public here -- or belongs to another company -- is simply not
        // found, and the order is refused rather than quietly shortened.
        var ids = wanted.Select(l => l.ProductId).ToList();

        var products = await db.Products.IgnoreQueryFilters().AsNoTracking()
            .Where(p => ids.Contains(p.Id) && p.TenantId == shop.TenantId && p.IsPublic)
            .Select(p => new { p.Id, p.Title, p.Unit, p.SellingPrice })
            .ToDictionaryAsync(p => p.Id, p => p, ct);

        if (products.Count != wanted.Count)
        {
            return BadRequest(new { message = "Un des articles n'est plus offert. Rafraîchissez la page et réessayez." });
        }

        // A product with no price is "prix sur demande" on the page, and it has no business on
        // an order: the customer would be agreeing to a figure nobody has named.
        if (wanted.Any(l => products[l.ProductId].SellingPrice is null))
        {
            return BadRequest(new
            {
                message = "Un des articles n'a pas de prix affiché. Demandez une soumission à l'entreprise pour celui-là."
            });
        }

        var account = await AccountAsync(userId, ct);
        if (account is null) return Forbid();

        var client = await MyClientAsync(shop.TenantId, userId, ct);

        if (client?.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });

        // No file at this company yet, so one is opened. An order that belongs to nobody cannot
        // become an invoice, which is the whole reason for having it -- and somebody who has
        // just bought something is a customer, not a prospect.
        client ??= await OpenClientFileAsync(shop.TenantId, userId, account, request.ContactPhone, ct);

        var order = new CustomerOrder
        {
            TenantId = shop.TenantId,
            Number = await NextNumberAsync(shop.TenantId, ct),
            ClientId = client.Id,
            PlacedByUserId = userId,
            ContactName = client.Name,
            ContactEmail = client.Email ?? account.Email,
            ContactPhone = Clean(request.ContactPhone) ?? client.Phone,
            Note = Cap(Clean(request.Note), 2000),
            Status = CustomerOrderStatus.Recue,
            IsTaxExempt = client.IsTaxExempt,
            GstRate = shop.GstRate,
            QstRate = shop.QstRate
        };

        db.CustomerOrders.Add(order);

        var sort = 0;

        foreach (var line in wanted)
        {
            var product = products[line.ProductId];

            db.CustomerOrderLines.Add(new CustomerOrderLine
            {
                TenantId = shop.TenantId,
                OrderId = order.Id,
                ProductId = product.Id,
                // Copies, like an invoice line's: the catalogue moves, and what was agreed to
                // must not move with it.
                Description = Cap(product.Title, 500)!,
                Unit = Cap(product.Unit, 20),
                Quantity = line.Quantity,
                UnitPrice = product.SellingPrice!.Value,
                IsTaxable = true,
                SortOrder = sort++
            });
        }

        // Nothing is taken off the shelf. An order is a request, not a sale -- stock moves when
        // the company picks it, and letting a stranger decrement a shelf would be a way to empty
        // one without buying anything.
        await db.SaveChangesAsync(ct);

        return Ok(new PlaceOrderResultDto(
            order.Id,
            OrderNumber.Of(order.Number),
            $"Merci, votre commande {OrderNumber.Of(order.Number)} est envoyée à {shop.Name}."));
    }

    /// <summary>
    /// The customer file this account already has at this company, if any.
    ///
    /// Two ways to be one, both counted: a membership that names a client, which is how access
    /// is granted today, and the account carried on the client record itself, which is how a
    /// particulier was invited before memberships existed.
    /// </summary>
    private async Task<Client?> MyClientAsync(Guid tenantId, Guid userId, CancellationToken ct)
    {
        var clients = db.Clients.IgnoreQueryFilters().Where(c => c.TenantId == tenantId);

        var direct = await clients.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (direct is not null) return direct;

        var membershipClientId = await db.TenantMemberships.IgnoreQueryFilters().AsNoTracking()
            .Where(m => m.UserId == userId
                && m.TenantId == tenantId
                && m.Role == UserRole.Client
                && m.ClientId != null)
            .Select(m => m.ClientId)
            .FirstOrDefaultAsync(ct);

        return membershipClientId is { } clientId
            ? await clients.FirstOrDefaultAsync(c => c.Id == clientId, ct)
            : null;
    }

    private async Task<Client> OpenClientFileAsync(
        Guid tenantId, Guid userId, AccountName account, string? phone, CancellationToken ct)
    {
        var highest = await db.Clients.IgnoreQueryFilters()
            .Where(c => c.TenantId == tenantId)
            .MaxAsync(c => (int?)c.Number, ct) ?? 0;

        var client = new Client
        {
            TenantId = tenantId,
            Number = highest + 1,
            // A person, because an account belongs to a person. A company buying through one of
            // its people is a conversation the seller has with them, and turning the account's
            // name into a company name here would be inventing a business that may not exist.
            Type = ClientType.Particulier,
            FirstName = account.FirstName,
            LastName = account.LastName,
            Name = account.Name,
            Email = account.Email,
            Phone = Clean(phone),
            // Not a prospect: they have just ordered something.
            Status = ClientStatus.Client,
            // Where they came from, written on the record. Six months later nobody remembers,
            // and "d'où sort ce client" is the question somebody always asks.
            Notes = $"Créé par une commande de la page publique le {BusinessDay.Today:d MMMM yyyy}.",
            // The account is attached straight away, which is what makes the order visible in
            // their own space and what stops a second order opening a second file.
            UserId = userId
        };

        db.Clients.Add(client);
        return client;
    }

    private async Task<int> NextNumberAsync(Guid tenantId, CancellationToken ct)
    {
        var highest = await db.CustomerOrders.IgnoreQueryFilters()
            .Where(o => o.TenantId == tenantId)
            .MaxAsync(o => (int?)o.Number, ct) ?? 0;

        return highest + 1;
    }

    /// <summary>The name and address on the account, which is what a company has to go on.</summary>
    private record AccountName(string Name, string? FirstName, string? LastName, string? Email);

    private async Task<AccountName?> AccountAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.FirstName, u.LastName, u.Email })
            .FirstOrDefaultAsync(ct);

        if (user is null) return null;

        var name = $"{user.FirstName} {user.LastName}".Trim();

        return new AccountName(
            name.Length > 0 ? name : user.Email ?? "Client",
            user.FirstName,
            user.LastName,
            user.Email);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? Cap(string? value, int length)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var trimmed = value.Trim();
        return trimmed.Length > length ? trimmed[..length] : trimmed;
    }
}

/// <summary>
/// How an order's number is written: CMD-0001.
///
/// One place, because the customer's screen, the company's list and the message said back at
/// the checkout all quote it, and a number that reads three ways is a number nobody can search.
/// </summary>
public static class OrderNumber
{
    public static string Of(int number) => $"CMD-{number:0000}";
}
