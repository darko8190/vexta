using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Public;

/// <summary>
/// A form a stranger is allowed to see and fill, with the bits both reading it and filing it
/// need.
/// </summary>
public record PublicFormContext(
    Guid TenantId,
    Guid FormId,
    string Title,
    string? Description,
    FormKind Kind,
    string? SuccessMessage);

/// <summary>
/// The one gate every public form route passes through, written once because reading a form and
/// filing it must agree about what is reachable. Two copies would eventually disagree, and the
/// disagreement would be a form that goes on collecting answers after the company took it off
/// its page — see <see cref="PublicJobGate"/>, which does the same job for postings.
///
/// Four things have to be true, and all four are the company's own decisions: it is paying for
/// Vexta, its page is published, its page shows forms, and this form is both published and
/// ticked for the page. Every failure returns null so the caller answers one identical 404 —
/// nobody outside can tell a company that does not exist from a form taken down this morning.
/// </summary>
public static class PublicFormGate
{
    /// <summary>The forms on a company's page, in the order the company put them in.</summary>
    public static async Task<List<PublicFormContext>> ListAsync(
        VextaDbContext db, Guid tenantId, CancellationToken ct) =>
        await db.FormTemplates.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.TenantId == tenantId && f.ShowOnPublicPage && f.IsPublished)
            .OrderBy(f => f.SortOrder).ThenBy(f => f.Title)
            .Select(f => new PublicFormContext(
                f.TenantId, f.Id, f.Title, f.Description, f.Kind, f.SuccessMessage))
            .ToListAsync(ct);

    public static async Task<PublicFormContext?> ResolveAsync(
        VextaDbContext db, string slug, Guid formId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(slug)) return null;

        var tenantId = await TenantIdAsync(db, slug, ct);
        if (tenantId is not { } id) return null;

        return await db.FormTemplates.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.Id == formId && f.TenantId == id && f.ShowOnPublicPage && f.IsPublished)
            .Select(f => new PublicFormContext(
                f.TenantId, f.Id, f.Title, f.Description, f.Kind, f.SuccessMessage))
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// The company behind a slug, when it is one a stranger may read forms from.
    ///
    /// The subscription is part of it, and in this direction on purpose: the editor is behind
    /// the same gate, so a company that stopped paying could not take its own forms off the
    /// internet if we kept serving them.
    /// </summary>
    private static async Task<Guid?> TenantIdAsync(VextaDbContext db, string slug, CancellationToken ct)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Slug == slug)
            .Select(t => new { t.Id, t.SubscriptionStatus })
            .FirstOrDefaultAsync(ct);

        if (tenant is null || tenant.SubscriptionStatus != TenantSubscriptionStatus.Active) return null;

        var pageShowsForms = await db.PublicPages.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.TenantId == tenant.Id)
            .Select(p => p.IsPublished && p.ShowForms)
            .FirstOrDefaultAsync(ct);

        return pageShowsForms ? tenant.Id : null;
    }
}
