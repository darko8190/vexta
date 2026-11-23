using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Hr;

/// <summary>
/// The positions the company is hiring for.
///
/// Moved here from the public page, where it started life as a list of advertisements. A posting
/// is a hiring decision that happens to be advertised, not a paragraph of marketing that happens
/// to attract people — and keeping it under the page meant the owner could edit the wording of a
/// position without ever seeing how many people had answered it.
///
/// Owner only, like the rest of Ressources humaines: what the company is hiring for and what it
/// is prepared to pay are not an employee's to read.
///
/// Every query scopes by tenant by hand. <see cref="JobPosting"/> carries no query filter, by
/// design — a visitor with no session reads it through the slug in the route — so the safety net
/// the rest of the application leans on is absent here.
/// </summary>
[ApiController]
[Route("api/offres-emplois")]
[StaffOnly]
[Authorize(Roles = Roles.Owner)]
[RequireActiveSubscription]
public class JobPostingsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>
    /// All of them, filled and closed included: this is the file, not the page. A company that
    /// hires the same four trades every spring reopens last year's posting rather than retyping it.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<JobPostingDto>>> List(
        [FromQuery] JobPostingStatus? statut, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var query = db.JobPostings.AsNoTracking().Where(j => j.TenantId == tenantId);
        if (statut is { } status) query = query.Where(j => j.Status == status);

        var items = await query
            // Open positions first, then the most recently advertised: the top of this list is
            // what the company is actually hiring for today.
            .OrderBy(j => j.Status == JobPostingStatus.Pourvue || j.Status == JobPostingStatus.Fermee)
            .ThenByDescending(j => j.PostedOn ?? DateOnly.FromDateTime(j.CreatedAt.UtcDateTime))
            .ThenByDescending(j => j.CreatedAt)
            .Select(ToDto())
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<JobPostingDto>> Create(SaveJobPostingRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var job = new JobPosting { TenantId = tenantId, Title = request.Title.Trim() };
        Apply(job, request);

        db.JobPostings.Add(job);
        await db.SaveChangesAsync(ct);

        return Ok(ToDtoValue(job, 0));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<JobPostingDto>> Update(
        Guid id, SaveJobPostingRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var job = await db.JobPostings.FirstOrDefaultAsync(j => j.Id == id && j.TenantId == tenantId, ct);
        if (job is null) return NotFound();

        job.Title = request.Title.Trim();
        Apply(job, request);
        job.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        var applications = await db.Candidates.CountAsync(c => c.JobPostingId == id, ct);
        return Ok(ToDtoValue(job, applications));
    }

    /// <summary>
    /// Deletes the advertisement, not the applications. The candidates it drew keep their cards
    /// and lose only the link — see the SetNull in the model. A company tidying up last spring
    /// must not lose the record of who answered.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var job = await db.JobPostings.FirstOrDefaultAsync(j => j.Id == id && j.TenantId == tenantId, ct);
        if (job is null) return NoContent();

        db.JobPostings.Remove(job);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Everything but the title, which the callers set themselves so a create can refuse a blank
    /// one before the row exists.
    ///
    /// The publication flag is written from the status here, in the one place postings are
    /// saved. The visitor's query filters on the flag, so a position that has been filled comes
    /// off the page by being marked filled — without anybody remembering a second switch.
    /// </summary>
    private static void Apply(JobPosting job, SaveJobPostingRequest request)
    {
        job.Description = Clean(request.Description);
        job.Location = Clean(request.Location);
        job.EmploymentType = request.EmploymentType;
        job.Compensation = Clean(request.Compensation);
        job.ApplyTo = Clean(request.ApplyTo);
        job.Notes = Clean(request.Notes);
        job.Openings = request.Openings < 1 ? 1 : request.Openings;
        job.Status = request.Status;
        job.ClosesOn = request.ClosesOn;

        // Dated the day it goes out, and only once: a posting republished after a week should
        // still say when it first appeared.
        job.PostedOn = request.Status == JobPostingStatus.Brouillon
            ? null
            : request.PostedOn ?? job.PostedOn ?? BusinessDay.Today;

        job.IsPublished = request.Status == JobPostingStatus.Publiee;
    }

    private static string? Problem(SaveJobPostingRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title)) return "Le titre est obligatoire.";
        if (request.Title.Trim().Length > 200) return "Le titre ne peut pas dépasser 200 caractères.";
        if (request.Description is { Length: > 4000 }) return "La description ne peut pas dépasser 4000 caractères.";
        if (request.Location is { Length: > 200 }) return "Le lieu ne peut pas dépasser 200 caractères.";
        if (request.Compensation is { Length: > 200 }) return "La rémunération ne peut pas dépasser 200 caractères.";
        if (request.ApplyTo is { Length: > 300 }) return "Ce champ ne peut pas dépasser 300 caractères.";
        if (request.Notes is { Length: > 4000 }) return "Les notes ne peuvent pas dépasser 4000 caractères.";

        // A hundred openings is already a company hiring a whole crew. Past that it is a typo,
        // and a posting for 1000 people would quietly become the biggest number on the page.
        if (request.Openings is < 1 or > 100) return "Le nombre de postes doit être entre 1 et 100.";

        if (request is { PostedOn: { } posted, ClosesOn: { } closes } && closes < posted)
        {
            return "La date de fermeture ne peut pas précéder la date d'affichage.";
        }

        // An undefined enum value arrives as a plain integer cast, which would be stored and then
        // shown as a blank for ever.
        if (!Enum.IsDefined(request.EmploymentType)) return "Ce type d'emploi n'existe pas.";
        return Enum.IsDefined(request.Status) ? null : "Cet état n'existe pas.";
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// The count of applications comes from the candidates rather than from a column on the
    /// posting: a stored tally is one more thing to keep in step, and it would be wrong the
    /// moment somebody deletes an application.
    /// </summary>
    private static System.Linq.Expressions.Expression<Func<JobPosting, JobPostingDto>> ToDto() =>
        j => new JobPostingDto(
            j.Id, j.Title, j.Description, j.Location, j.EmploymentType,
            j.Compensation, j.ApplyTo, j.Notes, j.Openings, j.Status,
            j.PostedOn, j.ClosesOn, j.Candidates.Count, j.IsPublished, j.CreatedAt, j.UpdatedAt);

    private static JobPostingDto ToDtoValue(JobPosting j, int applications) =>
        new(j.Id, j.Title, j.Description, j.Location, j.EmploymentType,
            j.Compensation, j.ApplyTo, j.Notes, j.Openings, j.Status,
            j.PostedOn, j.ClosesOn, applications, j.IsPublished, j.CreatedAt, j.UpdatedAt);
}
