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
    string? SuccessMessage,
    bool RequiresIdentification = false);

/// <summary>A form reached by its own link, with what its page needs to look like the company's.</summary>
public record SharedFormContext(PublicFormContext Form, string CompanyName, string? BrandColor, string? LogoETag);

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
                f.TenantId, f.Id, f.Title, f.Description, f.Kind, f.SuccessMessage, f.RequiresIdentification))
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
                f.TenantId, f.Id, f.Title, f.Description, f.Kind, f.SuccessMessage, f.RequiresIdentification))
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// A form reached by its own link (/f/{id}), sent by the company to somebody in particular.
    ///
    /// Fewer gates than the page, on purpose: the company's page is a storefront it may never
    /// open, and sharing one form must not oblige it to. What remains is what a link cannot do
    /// without: the company is paying (or on a trial still running), the form is published, and
    /// it asks for no file — a visitor with no account has nowhere to upload one.
    /// </summary>
    public static async Task<SharedFormContext?> ResolveSharedAsync(
        VextaDbContext db, Guid formId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;

        var found = await db.FormTemplates.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.Id == formId && f.IsPublished)
            .Join(db.Tenants.IgnoreQueryFilters(), f => f.TenantId, t => t.Id, (f, t) => new { f, t })
            .Where(x => x.t.Kind == TenantKind.Business
                && (x.t.SubscriptionStatus == TenantSubscriptionStatus.Active
                    || (x.t.SubscriptionStatus == TenantSubscriptionStatus.Trialing && x.t.TrialEndsAt > now)))
            .Select(x => new SharedFormContext(
                new PublicFormContext(
                    x.f.TenantId, x.f.Id, x.f.Title, x.f.Description, x.f.Kind, x.f.SuccessMessage,
                    x.f.RequiresIdentification),
                x.t.Name,
                x.t.BrandColor,
                x.t.Logo != null ? x.t.Logo.ETag : null))
            .FirstOrDefaultAsync(ct);

        if (found is null) return null;

        var asksForFile = await db.FormFields.IgnoreQueryFilters().AsNoTracking()
            .AnyAsync(f => f.FormTemplateId == formId && f.Type == FormFieldType.Fichier, ct);

        return asksForFile ? null : found;
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
