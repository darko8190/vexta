using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Orders;

/// <summary>A company whose shop window is open for orders.</summary>
public record ShopContext(Guid TenantId, string Name, decimal GstRate, decimal QstRate);

/// <summary>
/// The one gate every ordering route passes through, written once because asking "may I order
/// here" and actually ordering must agree. Two copies would eventually disagree, and the
/// disagreement would be a basket that keeps taking orders after the company closed its shop.
///
/// Four of the company's own decisions have to line up: it is paying for Vexta, its page is
/// published, that page shows its products, and it accepts orders. Showing products and taking
/// orders are deliberately two switches — a shop window is "this is what we carry", a basket is
/// "ask us and we will get it to you", and the second is a promise nobody should make by
/// accident.
///
/// Every failure returns null, so the caller answers one identical 404: nobody outside can tell
/// a company that does not exist from one that closed its shop this morning.
/// </summary>
public static class ShopGate
{
    public static async Task<ShopContext?> ResolveAsync(
        VextaDbContext db, string? slug, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(slug)) return null;

        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Slug == slug)
            .Select(t => new { t.Id, t.Name, t.SubscriptionStatus })
            .FirstOrDefaultAsync(ct);

        if (tenant is null || tenant.SubscriptionStatus != TenantSubscriptionStatus.Active) return null;

        var open = await db.PublicPages.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.TenantId == tenant.Id)
            .Select(p => p.IsPublished && p.ShowProducts && p.AcceptsOrders)
            .FirstOrDefaultAsync(ct);

        if (!open) return null;

        // Read here rather than at the moment of saving, so the figure the checkout shows and
        // the figure stored on the order come from the same read of the same row.
        var rates = await db.BillingSettings.IgnoreQueryFilters().AsNoTracking()
            .Where(b => b.TenantId == tenant.Id)
            .Select(b => new { b.GstRate, b.QstRate })
            .FirstOrDefaultAsync(ct);

        return new ShopContext(tenant.Id, tenant.Name, rates?.GstRate ?? 0m, rates?.QstRate ?? 0m);
    }
}
