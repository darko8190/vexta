using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Forms;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Public;

/// <summary>
/// Applying for a position advertised on a company's public page.
///
/// Its own controller rather than an action on the anonymous one, because a class marked
/// <c>AllowAnonymous</c> wins over an action marked <c>Authorize</c>: an authenticated endpoint
/// cannot live inside it, and putting it there would have produced exactly the opposite of what
/// was intended, silently.
///
/// Applying needs an account and a filled-in CV. That is not a hurdle for its own sake. The
/// company at the other end receives a name, a telephone number and an account of what somebody
/// has done, rather than a form it has to chase; and the applicant writes their CV once rather
/// than for each company they answer.
///
/// What the company gets is a copy, made here: a <see cref="Candidate"/> in its own space, with
/// the CV frozen as it read at the moment of applying and the uploaded document copied under the
/// company's own prefix. Nothing in the company's space points into the applicant's. They can
/// change or delete their CV tomorrow without rewriting an application somebody already has.
/// </summary>
[ApiController]
[Route("api/candidatures")]
[Authorize]
public class JobApplicationsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IR2StorageService storage,
    IFormActionRunner actions,
    ILogger<JobApplicationsController> logger) : ControllerBase
{
    /// <summary>
    /// What this account would send, and whether it may. Read by the public page before it
    /// offers the button, so somebody is told what is missing instead of being refused after
    /// writing a covering note.
    /// </summary>
    [HttpGet("admissibilite")]
    public async Task<ActionResult<ApplicationEligibilityDto>> Eligibility(
        [FromQuery] string slug, [FromQuery] Guid offre, CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        var context = await PublicJobGate.ResolveAsync(db, slug, offre, requireForm: false, ct);
        if (context is null) return NotFound();

        var profile = await ProfileAsync(userId, ct);
        var already = await db.Candidates.IgnoreQueryFilters()
            .AnyAsync(c => c.JobPostingId == offre && c.ApplicantUserId == userId, ct);

        return Ok(new ApplicationEligibilityDto(
            context.JobTitle,
            profile?.IsComplete ?? false,
            MissingOf(profile),
            already,
            context.FormId is not null));
    }

    [HttpPost]
    public async Task<ActionResult<ApplicationResultDto>> Apply(
        ApplyToJobRequest request, CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        var context = await PublicJobGate.ResolveAsync(db, request.Slug, request.JobPostingId, requireForm: false, ct);
        if (context is null) return NotFound();

        var profile = await ProfileAsync(userId, ct);
        if (profile is null || !profile.IsComplete)
        {
            return BadRequest(new
            {
                message = "Complétez votre CV avant de postuler : " + string.Join(", ", MissingOf(profile)) + "."
            });
        }

        // Checked here as well as by the unique index, so the answer is a sentence rather than a
        // database error. The index is what actually holds when a button is pressed twice.
        if (await db.Candidates.IgnoreQueryFilters()
            .AnyAsync(c => c.JobPostingId == context.JobPostingId && c.ApplicantUserId == userId, ct))
        {
            return BadRequest(new { message = "Vous avez déjà postulé à cette offre." });
        }

        var account = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.FirstName, u.LastName, u.Email })
            .FirstAsync(ct);

        // The questions the company attached, when it attached any. Validated by the same rules
        // the office is held to, before anything is written.
        var fields = context.FormId is { } formId
            ? await db.FormFields.IgnoreQueryFilters().AsNoTracking()
                .Where(f => f.FormTemplateId == formId)
                .OrderBy(f => f.SortOrder)
                .ToListAsync(ct)
            : [];

        var given = (request.Answers ?? [])
            .GroupBy(a => a.FieldId)
            .ToDictionary(g => g.Key, g => g.Last());

        foreach (var field in fields)
        {
            given.TryGetValue(field.Id, out var answer);

            // A file answer is named from the asset, never from what the caller typed.
            var value = field.Type == FormFieldType.Fichier
                ? await MyAssetNameAsync(answer?.MediaAssetId, ct)
                : answer?.Value;

            if (FormAnswerRules.Problem(field, value) is { } problem)
            {
                return BadRequest(new { message = problem });
            }
        }

        // Everything the company will be able to open has to be copied into its own space
        // first: its media routes are scoped to its tenant, and a row pointing at the
        // applicant's prefix would be a broken link at best and a cross-tenant read at worst.
        var resumeCopy = await CopyToCompanyAsync(profile.ResumeMediaAssetId, context.TenantId, ct);

        var candidate = new Candidate
        {
            TenantId = context.TenantId,
            FirstName = account.FirstName,
            LastName = account.LastName,
            Email = account.Email,
            Phone = profile.Phone,
            JobPostingId = context.JobPostingId,
            DesiredJobTitle = context.JobTitle,
            Source = "Page publique",
            Status = CandidateStatus.Nouveau,
            AppliedOn = BusinessDay.Today,
            ApplicantUserId = userId,
            ResumeMediaAssetId = resumeCopy,
            // The CV as it read today, frozen. Written here rather than left for the company to
            // fetch, because there is nothing for it to fetch: this record is the application.
            ApplicationSummary = CvText.Build(account.FirstName, account.LastName, account.Email, profile, request.CoverNote)
        };

        db.Candidates.Add(candidate);

        FormSubmission? submission = null;
        if (context.FormId is { } form && fields.Count > 0)
        {
            submission = new FormSubmission
            {
                TenantId = context.TenantId,
                FormTemplateId = form,
                // Not the applicant's user id: that id belongs to an account outside this
                // company, and a column here named "submitted by" would read as one of its own.
                SubmittedByUserId = null,
                SubmittedByName = $"{account.FirstName} {account.LastName}".Trim()
            };

            db.FormSubmissions.Add(submission);

            for (var index = 0; index < fields.Count; index++)
            {
                var field = fields[index];
                given.TryGetValue(field.Id, out var answer);

                var assetCopy = field.Type == FormFieldType.Fichier
                    ? await CopyToCompanyAsync(answer?.MediaAssetId, context.TenantId, ct)
                    : null;

                db.FormAnswers.Add(new FormAnswer
                {
                    TenantId = context.TenantId,
                    SubmissionId = submission.Id,
                    FormFieldId = field.Id,
                    Label = field.Label,
                    Type = field.Type,
                    Value = field.Type == FormFieldType.Fichier
                        ? await MyAssetNameAsync(answer?.MediaAssetId, ct)
                        : Clean(answer?.Value),
                    MediaAssetId = assetCopy,
                    SortOrder = index
                });
            }
        }

        await db.SaveChangesAsync(ct);

        // After the application is safely down, never before: an email that cannot leave must
        // not cost somebody the CV they just sent.
        if (submission is not null)
        {
            var log = await actions.RunAsync(submission, ct);
            if (log is not null)
            {
                var tracked = await db.FormSubmissions.IgnoreQueryFilters()
                    .FirstAsync(s => s.Id == submission.Id, ct);
                tracked.ActionLog = log.Length > 1000 ? log[..1000] : log;
                await db.SaveChangesAsync(ct);
            }
        }

        // The action log is deliberately not returned. Whether the company's own notification
        // reached it is the company's business, and an applicant told "email not sent" learns
        // about a misconfiguration they can do nothing about.
        return Ok(new ApplicationResultDto(
            string.IsNullOrWhiteSpace(context.SuccessMessage)
                ? "Merci, votre candidature est envoyée."
                : context.SuccessMessage!));
    }

    // ---- Helpers ----

    private Task<PersonalProfile?> ProfileAsync(Guid userId, CancellationToken ct) =>
        db.PersonalProfiles.AsNoTracking()
            .Include(p => p.Experiences.OrderBy(x => x.SortOrder))
            .Include(p => p.Education.OrderBy(x => x.SortOrder))
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);

    private static List<string> MissingOf(PersonalProfile? profile)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(profile?.Phone)) missing.Add("un numéro de téléphone");
        if ((profile?.Experiences.Count ?? 0) == 0 && profile?.ResumeMediaAssetId is null)
        {
            missing.Add("une expérience de travail ou un CV téléversé");
        }
        return missing;
    }

    /// <summary>The file's own name, and only if it is one this account uploaded.</summary>
    private async Task<string?> MyAssetNameAsync(Guid? assetId, CancellationToken ct)
    {
        if (assetId is not { } id || currentUser.TenantId is not { } tenantId) return null;

        return await db.MediaAssets.IgnoreQueryFilters()
            .Where(m => m.Id == id && m.TenantId == tenantId)
            .Select(m => m.FileName)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// Copies one of this account's files into the company's own space and returns the new
    /// asset's id, or null when there is nothing to copy or storage would not take it.
    ///
    /// A failure here does not fail the application. A CV that could not be copied is worth
    /// telling the log about; it is not worth refusing somebody a job application over, when
    /// the company still receives their name, their telephone number and their written CV.
    /// </summary>
    private async Task<Guid?> CopyToCompanyAsync(Guid? assetId, Guid companyTenantId, CancellationToken ct)
    {
        if (assetId is not { } id || currentUser.TenantId is not { } mine) return null;

        var source = await db.MediaAssets.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == id && m.TenantId == mine, ct);

        if (source is null) return null;

        var copy = new MediaAsset
        {
            TenantId = companyTenantId,
            // The company's own prefix, which is what makes its media routes able to serve it.
            ObjectKey = $"{companyTenantId}/{Guid.NewGuid()}{Path.GetExtension(source.FileName)}",
            FileName = source.FileName,
            ContentType = source.ContentType,
            ContentEncoding = source.ContentEncoding,
            SizeBytes = source.SizeBytes,
            OriginalSizeBytes = source.OriginalSizeBytes,
            // Not the applicant: nobody in that company uploaded this, and naming one of their
            // accounts would be wrong in the only place anybody would look.
            UploadedById = null
        };

        try
        {
            await storage.CopyAsync(source.ObjectKey, copy.ObjectKey, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Copie du fichier {AssetId} vers le locataire {TenantId} impossible.", id, companyTenantId);
            return null;
        }

        db.MediaAssets.Add(copy);
        return copy.Id;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>What an account would send to a posting, and whether it may.</summary>
public record ApplicationEligibilityDto(
    string JobTitle,
    bool CanApply,
    List<string> Missing,
    bool AlreadyApplied,
    /// <summary>Whether the company attached questions beyond the CV.</summary>
    bool HasForm);

public record ApplyAnswer(Guid FieldId, string? Value, Guid? MediaAssetId);

public record ApplyToJobRequest(
    string Slug,
    Guid JobPostingId,
    /// <summary>A few lines in their own words. Optional, and usually what gets read first.</summary>
    string? CoverNote,
    List<ApplyAnswer>? Answers);

public record ApplicationResultDto(string Message);
