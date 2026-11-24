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
/// Applying for a job from the company's public page, with no account.
///
/// The same two rules as the page it is reached from: every query names the tenant and ignores
/// the query filters, because there is no signed-in tenant to resolve them against; and nothing
/// is told to the caller that was not deliberately put in a DTO here.
///
/// A third rule applies only here, because this is the one place a stranger writes rather than
/// reads. Everything that arrives is treated as a claim, not a fact: the posting must be
/// published, its form must be published, the questions are validated by the same rules the
/// office is held to, and the candidate record is assembled from the answers' declared targets
/// rather than from anything the caller names directly. The caller never chooses a tenant, a
/// posting's owner, or a field's meaning.
/// </summary>
[ApiController]
[Route("api/public/companies/{slug}/offres")]
[AllowAnonymous]
public class PublicApplicationController(VextaDbContext db, IFormActionRunner actions) : ControllerBase
{
    /// <summary>
    /// The questions to fill, for a posting that has a form attached.
    ///
    /// Fetched on demand rather than carried on the page: most visitors read a posting and
    /// never apply, and five postings with a dozen questions each would be paid for by every
    /// one of them.
    /// </summary>
    [HttpGet("{jobId:guid}/formulaire")]
    public async Task<ActionResult<PublicJobFormDto>> Form(string slug, Guid jobId, CancellationToken ct)
    {
        var context = await ResolveAsync(slug, jobId, ct);
        if (context is null) return NotFound();

        var fields = await db.FormFields.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.FormTemplateId == context.FormId)
            .OrderBy(f => f.SortOrder)
            .Select(f => new PublicFormFieldDto(
                f.Id, f.Label, f.HelpText, f.Type, f.IsRequired, f.Options))
            .ToListAsync(ct);

        if (fields.Count == 0) return NotFound();

        return Ok(new PublicJobFormDto(
            context.JobTitle, context.FormTitle, context.FormDescription, fields));
    }

    /// <summary>
    /// Files an application: the answers, and a candidate card for the company to work from.
    ///
    /// The card is built from the answers whose questions were pointed at a name, an address or
    /// a telephone number -- the same mechanism a form already uses to create a client. So a
    /// company that wants an applicant's name asks for it in its own words and says what the
    /// answer is, and nothing here has to guess which question was the name.
    /// </summary>
    [HttpPost("{jobId:guid}/candidature")]
    public async Task<ActionResult<PublicApplicationResultDto>> Apply(
        string slug, Guid jobId, SubmitPublicApplicationRequest request, CancellationToken ct)
    {
        var context = await ResolveAsync(slug, jobId, ct);
        if (context is null) return NotFound();

        var fields = await db.FormFields.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.FormTemplateId == context.FormId)
            .OrderBy(f => f.SortOrder)
            .ToListAsync(ct);

        if (fields.Count == 0) return NotFound();

        var given = (request.Answers ?? [])
            .GroupBy(a => a.FieldId)
            .ToDictionary(g => g.Key, g => g.Last().Value);

        // Walked over the questions, not over what arrived: an answer sent for a field that is
        // not on this form is ignored rather than stored, and a required field left out of the
        // payload altogether is still a required field left empty.
        foreach (var field in fields)
        {
            given.TryGetValue(field.Id, out var value);
            if (FormAnswerRules.Problem(field, value) is { } problem)
            {
                return BadRequest(new { message = problem });
            }
        }

        var submission = new FormSubmission
        {
            TenantId = context.TenantId,
            FormTemplateId = context.FormId,
            // No account behind this one. The name is written from the answers below, so the
            // company sees who it was rather than an empty row.
            SubmittedByUserId = null
        };

        db.FormSubmissions.Add(submission);

        var answers = new List<FormAnswer>(fields.Count);
        for (var index = 0; index < fields.Count; index++)
        {
            var field = fields[index];
            given.TryGetValue(field.Id, out var value);

            var answer = new FormAnswer
            {
                TenantId = context.TenantId,
                SubmissionId = submission.Id,
                FormFieldId = field.Id,
                // Copies, not references: editing the form next month must not rewrite what
                // somebody answered today.
                Label = field.Label,
                Type = field.Type,
                Value = Clean(value),
                SortOrder = index
            };

            answers.Add(answer);
            db.FormAnswers.Add(answer);
        }

        string? Target(FormFieldTarget target) =>
            fields
                .Where(f => f.Target == target)
                .Select(f => answers.FirstOrDefault(a => a.FormFieldId == f.Id)?.Value)
                .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))
                ?.Trim();

        var firstName = Target(FormFieldTarget.Prenom);
        var lastName = Target(FormFieldTarget.Nom);

        // A candidate card with no name on it is a row nobody can act on, so the name is the
        // one thing an application cannot be filed without. Said plainly, because the company
        // built the form and can add the question.
        if (string.IsNullOrWhiteSpace(firstName) && string.IsNullOrWhiteSpace(lastName))
        {
            return BadRequest(new
            {
                message = "Ce formulaire ne demande pas votre nom. Écrivez directement à l'entreprise."
            });
        }

        submission.SubmittedByName = $"{firstName} {lastName}".Trim();

        db.Candidates.Add(new Candidate
        {
            TenantId = context.TenantId,
            FirstName = firstName ?? lastName!,
            LastName = string.IsNullOrWhiteSpace(firstName) ? "" : lastName ?? "",
            Email = Target(FormFieldTarget.Courriel),
            Phone = Target(FormFieldTarget.Telephone),
            JobPostingId = jobId,
            DesiredJobTitle = context.JobTitle,
            // Not free text this time: the one thing the company knows for certain about this
            // application is where it came from.
            Source = "Page publique",
            Status = CandidateStatus.Nouveau,
            AppliedOn = BusinessDay.Today,
            Notes = Target(FormFieldTarget.Notes)
        });

        await db.SaveChangesAsync(ct);

        // After the answers are safely down, never before: an action that fails must not cost
        // somebody the form they just filled.
        var log = await actions.RunAsync(submission, ct);
        if (log is not null)
        {
            var tracked = await db.FormSubmissions.IgnoreQueryFilters()
                .FirstAsync(s => s.Id == submission.Id, ct);
            tracked.ActionLog = log.Length > 1000 ? log[..1000] : log;
            await db.SaveChangesAsync(ct);
        }

        // The action log is deliberately not returned. Whether an email reached the office is
        // the company's business, and a stranger told "Courriel non envoyé" learns about a
        // misconfiguration they can do nothing about.
        return Ok(new PublicApplicationResultDto(
            string.IsNullOrWhiteSpace(context.SuccessMessage)
                ? "Merci, votre candidature est envoyée."
                : context.SuccessMessage));
    }

    /// <summary>
    /// The one gate both endpoints pass through: this slug, this posting, published, with a
    /// published form on it. Returns null for every failure, so a caller cannot tell a company
    /// that does not exist from a posting that is a draft from a form that is unpublished.
    /// </summary>
    private async Task<ApplicationContext?> ResolveAsync(string slug, Guid jobId, CancellationToken ct)
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

        return await db.JobPostings.IgnoreQueryFilters().AsNoTracking()
            .Where(j =>
                j.Id == jobId
                && j.TenantId == tenantId
                && j.IsPublished
                && j.FormTemplateId != null
                && j.FormTemplate!.IsPublished)
            .Select(j => new ApplicationContext(
                j.TenantId,
                j.Title,
                j.FormTemplateId!.Value,
                j.FormTemplate!.Title,
                j.FormTemplate.Description,
                j.FormTemplate.SuccessMessage))
            .FirstOrDefaultAsync(ct);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private record ApplicationContext(
        Guid TenantId,
        string JobTitle,
        Guid FormId,
        string FormTitle,
        string? FormDescription,
        string? SuccessMessage);
}

/// <summary>The questions on a posting's form, as a visitor is shown them.</summary>
public record PublicJobFormDto(
    string JobTitle,
    string FormTitle,
    string? FormDescription,
    List<PublicFormFieldDto> Fields);

/// <summary>
/// One question. Deliberately not the staff DTO: a field also carries which record a target
/// fills and what order it was built in, and neither is a visitor's business.
/// </summary>
public record PublicFormFieldDto(
    Guid Id,
    string Label,
    string? HelpText,
    FormFieldType Type,
    bool IsRequired,
    /// <summary>The offered answers for a Choix or MultiChoix, one per line.</summary>
    string? Options);

public record PublicApplicationAnswer(Guid FieldId, string? Value);

public record SubmitPublicApplicationRequest(List<PublicApplicationAnswer>? Answers);

/// <summary>What to say back. One sentence, the company's own if it wrote one.</summary>
public record PublicApplicationResultDto(string Message);
