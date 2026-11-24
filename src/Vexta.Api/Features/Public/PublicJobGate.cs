using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;

namespace Vexta.Api.Features.Public;

/// <summary>
/// A position somebody outside the company is allowed to see and answer, with the bits both the
/// form and the application need.
/// </summary>
/// <param name="FormId">Null when the posting asks no questions beyond the applicant's own CV.</param>
public record PublicJobContext(
    Guid TenantId,
    Guid JobPostingId,
    string JobTitle,
    Guid? FormId,
    string? FormTitle,
    string? FormDescription,
    string? SuccessMessage);

/// <summary>
/// The one gate every public-facing job route passes through.
///
/// Shared rather than private to a controller because two routes now depend on it -- reading a
/// posting's questions, and applying to it -- and they must agree about what is reachable. Two
/// copies would eventually disagree, and the disagreement would be a posting that can be
/// applied to after the company took its page offline.
///
/// Every failure returns null, so the caller answers an identical 404 and nobody outside can
/// tell a company that does not exist from a page withdrawn from a posting still in draft.
/// </summary>
public static class PublicJobGate
{
    /// <param name="requireForm">
    /// True for the route that serves the questions: there is nothing to serve without a form.
    /// False for applying, which works on the applicant's CV alone when the company attached no
    /// form.
    /// </param>
    public static async Task<PublicJobContext?> ResolveAsync(
        VextaDbContext db, string slug, Guid jobId, bool requireForm, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(slug)) return null;

        var tenantId = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Slug == slug)
            .Select(t => t.Id)
            .FirstOrDefaultAsync(ct);

        if (tenantId == Guid.Empty) return null;

        // The page being published is part of the gate: a company that took its page offline has
        // withdrawn its postings with it, and a saved link must not keep filing applications.
        var pageIsPublished = await db.PublicPages.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.TenantId == tenantId)
            .Select(p => p.IsPublished && p.ShowJobs)
            .FirstOrDefaultAsync(ct);

        if (!pageIsPublished) return null;

        var context = await db.JobPostings.IgnoreQueryFilters().AsNoTracking()
            .Where(j => j.Id == jobId && j.TenantId == tenantId && j.IsPublished)
            .Select(j => new PublicJobContext(
                j.TenantId,
                j.Id,
                j.Title,
                // A form still in draft counts as no form at all. The posting stays open and
                // simply asks nothing extra, rather than offering questions nobody can file.
                j.FormTemplateId != null && j.FormTemplate!.IsPublished ? j.FormTemplateId : null,
                j.FormTemplate == null ? null : j.FormTemplate.Title,
                j.FormTemplate == null ? null : j.FormTemplate.Description,
                j.FormTemplate == null ? null : j.FormTemplate.SuccessMessage))
            .FirstOrDefaultAsync(ct);

        if (context is null) return null;
        return requireForm && context.FormId is null ? null : context;
    }
}
