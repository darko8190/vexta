using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Company;

/// <summary>
/// Where the owner writes the company's public page and the positions it is hiring for.
///
/// The owner only, like the rest of the company's card: this is the face the business shows the
/// world, and an employee turning it on or off is not a decision the employee should be making.
///
/// Every query here scopes by the signed-in tenant by hand. <see cref="PublicPage"/> and
/// <see cref="JobPosting"/> carry no query filter — a visitor with no session reads them through
/// the slug in the route — so the safety net the rest of the application leans on is absent, and
/// a forgotten clause would let one company edit another's page.
/// </summary>
[ApiController]
[Route("api/company")]
[StaffOnly]
[Authorize(Roles = Roles.Owner)]
[RequireActiveSubscription]
public class PublicPageController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>
    /// Reading the page creates nothing. A company that has never opened this screen has no row,
    /// and inventing one on a GET would publish nothing but would still record a decision nobody
    /// made — so the defaults are answered from here and the row appears on the first save.
    /// </summary>
    [HttpGet("public-page")]
    public async Task<ActionResult<PublicPageSettingsDto>> GetPublicPage(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var slug = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.Slug)
            .FirstOrDefaultAsync(ct);

        if (slug is null) return NotFound();

        var page = await db.PublicPages.AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == tenantId, ct);

        return Ok(page is null
            ? new PublicPageSettingsDto(false, null, null, null, true, true, slug, null)
            : new PublicPageSettingsDto(
                page.IsPublished, page.Headline, page.About, page.ContactNote,
                page.ShowProducts, page.ShowJobs, slug, page.UpdatedAt));
    }

    [HttpPut("public-page")]
    public async Task<ActionResult<PublicPageSettingsDto>> SavePublicPage(
        SavePublicPageRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        if (request.Headline is { Length: > 200 })
            return BadRequest(new { message = "L'accroche ne peut pas dépasser 200 caractères." });
        if (request.About is { Length: > 4000 })
            return BadRequest(new { message = "La présentation ne peut pas dépasser 4000 caractères." });
        if (request.ContactNote is { Length: > 1000 })
            return BadRequest(new { message = "La note de contact ne peut pas dépasser 1000 caractères." });

        var page = await db.PublicPages.FirstOrDefaultAsync(p => p.TenantId == tenantId, ct);
        if (page is null)
        {
            page = new PublicPage { TenantId = tenantId };
            db.PublicPages.Add(page);
        }

        page.IsPublished = request.IsPublished;
        page.Headline = Clean(request.Headline);
        page.About = Clean(request.About);
        page.ContactNote = Clean(request.ContactNote);
        page.ShowProducts = request.ShowProducts;
        page.ShowJobs = request.ShowJobs;
        page.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return await GetPublicPage(ct);
    }

    /// <summary>All of them, filled or not: the owner's table is the file, not the page.</summary>
    [HttpGet("jobs")]
    public async Task<ActionResult<List<JobPostingDto>>> Jobs(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var jobs = await db.JobPostings.AsNoTracking()
            .Where(j => j.TenantId == tenantId)
            .OrderByDescending(j => j.CreatedAt)
            .Select(ToDto())
            .ToListAsync(ct);

        return Ok(jobs);
    }

    [HttpPost("jobs")]
    public async Task<ActionResult<JobPostingDto>> CreateJob(SaveJobPostingRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var job = new JobPosting
        {
            TenantId = tenantId,
            Title = request.Title.Trim(),
            Description = Clean(request.Description),
            Location = Clean(request.Location),
            EmploymentType = request.EmploymentType,
            Compensation = Clean(request.Compensation),
            ApplyTo = Clean(request.ApplyTo),
            IsPublished = request.IsPublished
        };

        db.JobPostings.Add(job);
        await db.SaveChangesAsync(ct);

        return Ok(ToDtoValue(job));
    }

    [HttpPut("jobs/{id:guid}")]
    public async Task<ActionResult<JobPostingDto>> UpdateJob(
        Guid id, SaveJobPostingRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var job = await db.JobPostings.FirstOrDefaultAsync(j => j.Id == id && j.TenantId == tenantId, ct);
        if (job is null) return NotFound();

        job.Title = request.Title.Trim();
        job.Description = Clean(request.Description);
        job.Location = Clean(request.Location);
        job.EmploymentType = request.EmploymentType;
        job.Compensation = Clean(request.Compensation);
        job.ApplyTo = Clean(request.ApplyTo);
        job.IsPublished = request.IsPublished;
        job.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(ToDtoValue(job));
    }

    [HttpDelete("jobs/{id:guid}")]
    public async Task<IActionResult> DeleteJob(Guid id, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var job = await db.JobPostings.FirstOrDefaultAsync(j => j.Id == id && j.TenantId == tenantId, ct);
        if (job is null) return NoContent();

        db.JobPostings.Remove(job);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Problem(SaveJobPostingRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title)) return "Le titre est obligatoire.";
        if (request.Title.Trim().Length > 200) return "Le titre ne peut pas dépasser 200 caractères.";
        if (request.Description is { Length: > 4000 }) return "La description ne peut pas dépasser 4000 caractères.";
        if (request.Location is { Length: > 200 }) return "Le lieu ne peut pas dépasser 200 caractères.";
        if (request.Compensation is { Length: > 200 }) return "La rémunération ne peut pas dépasser 200 caractères.";
        if (request.ApplyTo is { Length: > 300 }) return "Ce champ ne peut pas dépasser 300 caractères.";

        // An undefined enum value arrives as a plain integer cast, which would be stored and then
        // shown as a blank type for ever.
        return Enum.IsDefined(request.EmploymentType) ? null : "Ce type d'emploi n'existe pas.";
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static System.Linq.Expressions.Expression<Func<JobPosting, JobPostingDto>> ToDto() =>
        j => new JobPostingDto(
            j.Id, j.Title, j.Description, j.Location, j.EmploymentType,
            j.Compensation, j.ApplyTo, j.IsPublished, j.CreatedAt, j.UpdatedAt);

    private static JobPostingDto ToDtoValue(JobPosting j) =>
        new(j.Id, j.Title, j.Description, j.Location, j.EmploymentType,
            j.Compensation, j.ApplyTo, j.IsPublished, j.CreatedAt, j.UpdatedAt);
}
