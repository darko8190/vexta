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
        if (await FormProblemAsync(request.FormTemplateId, tenantId, ct) is { } formProblem)
        {
            return BadRequest(new { message = formProblem });
        }

        var job = new JobPosting { TenantId = tenantId, Title = request.Title.Trim() };
        Apply(job, request);

        db.JobPostings.Add(job);
        await db.SaveChangesAsync(ct);

        return Ok(await ReadBackAsync(job.Id, ct));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<JobPostingDto>> Update(
        Guid id, SaveJobPostingRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        if (await FormProblemAsync(request.FormTemplateId, tenantId, ct) is { } formProblem)
        {
            return BadRequest(new { message = formProblem });
        }

        var job = await db.JobPostings.FirstOrDefaultAsync(j => j.Id == id && j.TenantId == tenantId, ct);
        if (job is null) return NotFound();

        job.Title = request.Title.Trim();
        Apply(job, request);
        job.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Ok(await ReadBackAsync(job.Id, ct));
    }

    /// <summary>
    /// Hangs a file already in the company's library on a posting.
    ///
    /// Takes an asset id rather than bytes: uploading goes through the media routes like every
    /// other file in the application, so the size limits, the quota and the compression are
    /// decided in one place instead of two.
    /// </summary>
    [HttpPost("{id:guid}/documents")]
    public async Task<ActionResult<JobPostingDto>> AddDocument(
        Guid id, AddJobPostingDocumentRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var job = await db.JobPostings
            .Include(j => j.Documents)
            .FirstOrDefaultAsync(j => j.Id == id && j.TenantId == tenantId, ct);
        if (job is null) return NotFound();

        // Twelve files on a job advertisement is already more than anybody reads, and every one
        // of them is bytes the company pays to store.
        if (job.Documents.Count >= 12)
        {
            return BadRequest(new { message = "Douze documents au maximum par offre." });
        }

        var asset = await db.MediaAssets.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == request.MediaAssetId && a.TenantId == tenantId, ct);
        if (asset is null) return BadRequest(new { message = "Ce fichier n'existe plus." });

        if (job.Documents.Any(d => d.MediaAssetId == asset.Id))
        {
            return BadRequest(new { message = "Ce fichier est déjà joint à cette offre." });
        }

        db.JobPostingDocuments.Add(new JobPostingDocument
        {
            TenantId = tenantId,
            JobPostingId = job.Id,
            MediaAssetId = asset.Id,
            Label = Clean(request.Label),
            SortOrder = job.Documents.Count == 0 ? 0 : job.Documents.Max(d => d.SortOrder) + 1
        });

        job.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(await ReadBackAsync(job.Id, ct));
    }

    /// <summary>
    /// Unhooks the file from the posting. The file itself stays in the library: it may be on
    /// another posting, and deleting bytes is the library's decision, not this screen's.
    /// </summary>
    [HttpDelete("{id:guid}/documents/{documentId:guid}")]
    public async Task<ActionResult<JobPostingDto>> RemoveDocument(
        Guid id, Guid documentId, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var document = await db.JobPostingDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.JobPostingId == id && d.TenantId == tenantId, ct);
        if (document is null) return NotFound();

        db.JobPostingDocuments.Remove(document);
        await db.SaveChangesAsync(ct);

        return Ok(await ReadBackAsync(id, ct));
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
        job.Category = Clean(request.Category);
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
        job.FormTemplateId = request.FormTemplateId;
    }

    private static string? Problem(SaveJobPostingRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title)) return "Le titre est obligatoire.";
        if (request.Title.Trim().Length > 200) return "Le titre ne peut pas dépasser 200 caractères.";
        if (request.Description is { Length: > 4000 }) return "La description ne peut pas dépasser 4000 caractères.";
        if (request.Location is { Length: > 200 }) return "Le lieu ne peut pas dépasser 200 caractères.";
        if (request.Compensation is { Length: > 200 }) return "La rémunération ne peut pas dépasser 200 caractères.";
        if (request.Category is { Length: > 100 }) return "La catégorie ne peut pas dépasser 100 caractères.";
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

    /// <summary>
    /// Whether that form may be attached. Checked against the tenant by hand: FormTemplate does
    /// carry a query filter, but the id arrives from the browser and a posting pointing at
    /// another company's form would publish its questions on this company's page.
    /// </summary>
    private async Task<string?> FormProblemAsync(Guid? formTemplateId, Guid tenantId, CancellationToken ct)
    {
        if (formTemplateId is not { } formId) return null;

        var exists = await db.FormTemplates.IgnoreQueryFilters()
            .AnyAsync(f => f.Id == formId && f.TenantId == tenantId, ct);

        return exists ? null : "Ce formulaire n'existe plus.";
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
            j.PostedOn, j.ClosesOn, j.Candidates.Count, j.IsPublished,
            j.FormTemplateId,
            j.FormTemplate == null ? null : j.FormTemplate.Title,
            j.FormTemplate != null && j.FormTemplate.IsPublished,
            j.Documents
                .OrderBy(d => d.SortOrder)
                .Select(d => new JobPostingDocumentDto(
                    d.Id, d.MediaAssetId, d.MediaAsset!.FileName, d.MediaAsset.ContentType,
                    d.MediaAsset.SizeBytes, d.Label, d.SortOrder))
                .ToList(),
            j.CreatedAt, j.UpdatedAt, j.Category);

    /// <summary>
    /// Re-read rather than built from the entity in hand, so a create or an update answers with
    /// the same shape as the list -- including the form's title and the documents, which the
    /// tracked entity has not loaded.
    /// </summary>
    private async Task<JobPostingDto> ReadBackAsync(Guid id, CancellationToken ct) =>
        await db.JobPostings.AsNoTracking().Where(j => j.Id == id).Select(ToDto()).FirstAsync(ct);
}
