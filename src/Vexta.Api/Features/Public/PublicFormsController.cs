using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Forms;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Public;

/// <summary>
/// Filling one of a company's forms from its public page, with no account.
///
/// The same two rules as the page it is reached from: every query names the tenant and ignores
/// the query filters, because there is no signed-in tenant to resolve them against; and nothing
/// is told to the caller that was not deliberately put in a DTO here.
///
/// A third rule applies because this is a stranger writing rather than reading. Everything that
/// arrives is a claim: the company must be paying, its page published, its page showing forms,
/// and this form both published and ticked for the page — all of which <see cref="PublicFormGate"/>
/// settles before a word of the payload is looked at. The questions are then validated by the
/// same rules the office is held to, and the answers' meaning comes from the form's own targets
/// and never from anything the caller names. The caller chooses no tenant, no form's owner and
/// no field's purpose.
///
/// And it is the one write on Vexta with no session behind it, so it is the one write with a
/// ceiling — see <see cref="IPublicSubmissionLimiter"/>.
/// </summary>
[ApiController]
[Route("api/public/companies/{slug}/formulaires")]
[AllowAnonymous]
public class PublicFormsController(
    VextaDbContext db,
    IFormActionRunner actions,
    IPublicSubmissionLimiter limiter) : ControllerBase
{
    /// <summary>
    /// The questions to fill.
    ///
    /// Fetched on demand rather than carried on the page, like a posting's: most visitors read a
    /// page and fill nothing, and three forms with a dozen questions each would be paid for by
    /// every one of them.
    /// </summary>
    [HttpGet("{formId:guid}")]
    public async Task<ActionResult<PublicFormDto>> Get(string slug, Guid formId, CancellationToken ct)
    {
        var context = await PublicFormGate.ResolveAsync(db, slug, formId, ct);
        if (context is null) return NotFound();

        var fields = await FieldsAsync(context.FormId, ct);

        // A form that lost its questions is a form that asks nothing: the same answer as a form
        // that was never there, because there is nothing to put on the screen either way.
        if (fields.Count == 0) return NotFound();

        return Ok(new PublicFormDto(
            context.FormId, context.Title, context.Description, context.Kind, fields));
    }

    [HttpPost("{formId:guid}")]
    public async Task<ActionResult<PublicFormResultDto>> Submit(
        string slug, Guid formId, SubmitPublicFormRequest request, CancellationToken ct)
    {
        var context = await PublicFormGate.ResolveAsync(db, slug, formId, ct);
        if (context is null) return NotFound();

        var address = HttpContext.Connection.RemoteIpAddress?.ToString();

        // Before the answers are read, so a flood costs one gate query rather than a validation
        // pass and a write. 429, which is the status a client should back off on.
        if (limiter.Problem(address, context.TenantId) is { } refusal)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new { message = refusal });
        }

        var fields = await db.FormFields.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.FormTemplateId == context.FormId)
            .OrderBy(f => f.SortOrder)
            .ToListAsync(ct);

        if (fields.Count == 0) return NotFound();

        // A Fichier question cannot be on a public form -- it is refused where the form is put
        // on the page -- but a form edited between the two could carry one. Treated as a 404
        // rather than filed with a hole in it: the office built that question to collect
        // something, and a reply that silently lacks it is worse than no reply.
        if (fields.Any(f => f.Type == FormFieldType.Fichier)) return NotFound();

        var given = (request.Answers ?? [])
            .GroupBy(a => a.FieldId)
            .ToDictionary(g => g.Key, g => g.Last().Value);

        // Validated against the questions and not against what arrived: a field left out of the
        // payload altogether is a field left empty, and a required one has to say so.
        foreach (var field in fields)
        {
            var value = given.GetValueOrDefault(field.Id);
            if (FormAnswerRules.Problem(field, value) is { } problem)
            {
                return BadRequest(new { message = problem });
            }
        }

        var submission = new FormSubmission
        {
            TenantId = context.TenantId,
            FormTemplateId = context.FormId,
            // No account, so no user id. The name is taken from the answers themselves below,
            // which is the only name there is.
            SubmittedByUserId = null,
            SubmittedByName = NameFrom(fields, given),
            FromPublicPage = true
        };

        db.FormSubmissions.Add(submission);

        for (var index = 0; index < fields.Count; index++)
        {
            var field = fields[index];

            db.FormAnswers.Add(new FormAnswer
            {
                TenantId = context.TenantId,
                SubmissionId = submission.Id,
                FormFieldId = field.Id,
                // Copies, not references, exactly as for a reply from the crew: renaming the
                // question next spring must not rewrite what a visitor answered today.
                Label = field.Label,
                Type = field.Type,
                Value = Clean(given.GetValueOrDefault(field.Id)),
                SortOrder = index
            });
        }

        await db.SaveChangesAsync(ct);
        limiter.Record(address, context.TenantId);

        // After the answers are safely down, never before: an action that fails must not cost
        // somebody the form they just filled in.
        var log = await actions.RunAsync(submission, ct);
        if (log is not null)
        {
            var tracked = await db.FormSubmissions.IgnoreQueryFilters()
                .FirstAsync(s => s.Id == submission.Id, ct);

            tracked.ActionLog = log.Length > 1000 ? log[..1000] : log;
            await db.SaveChangesAsync(ct);
        }

        // The company's own words when it wrote some. What the actions did is deliberately not
        // reported: a visitor has no use for "client C-0042 créé", and an e-mail address that
        // failed is the company's business and not a stranger's.
        return Ok(new PublicFormResultDto(string.IsNullOrWhiteSpace(context.SuccessMessage)
            ? "Merci, votre demande est envoyée."
            : context.SuccessMessage));
    }

    private Task<List<PublicFormFieldDto>> FieldsAsync(Guid formId, CancellationToken ct) =>
        db.FormFields.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.FormTemplateId == formId)
            .OrderBy(f => f.SortOrder)
            .Select(f => new PublicFormFieldDto(
                f.Id, f.Label, f.HelpText, f.Type, f.IsRequired, f.Options))
            .ToListAsync(ct);

    /// <summary>
    /// Who to say filled it, built from the answers the form itself points at a name.
    ///
    /// Read from the targets rather than from any field the caller chooses: a visitor must not
    /// be able to decide what the office sees in the "rempli par" column. Null when the form
    /// asks for no name, and the reply is then simply marked as coming from the page.
    /// </summary>
    private static string? NameFrom(
        IReadOnlyList<FormField> fields, IReadOnlyDictionary<Guid, string?> given)
    {
        string? Of(FormFieldTarget target) => fields
            .Where(f => f.Target == target)
            .Select(f => given.GetValueOrDefault(f.Id))
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
            ?.Trim();

        var name = Of(FormFieldTarget.NomEntreprise)
            ?? $"{Of(FormFieldTarget.Prenom)} {Of(FormFieldTarget.Nom)}".Trim();

        if (string.IsNullOrWhiteSpace(name)) return null;

        return name.Length > 200 ? name[..200] : name;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>One of the company's forms, as a visitor is shown it.</summary>
public record PublicFormDto(
    Guid Id,
    string Title,
    string? Description,
    FormKind Kind,
    List<PublicFormFieldDto> Fields);

/// <summary>
/// A form on the public page, before anybody opens it. The questions are not here: see
/// <see cref="PublicFormsController.Get"/>.
/// </summary>
public record PublicPageFormDto(Guid Id, string Title, string? Description, FormKind Kind);

public record PublicFormAnswer(Guid FieldId, string? Value);

public record SubmitPublicFormRequest(List<PublicFormAnswer>? Answers);

/// <summary>What to say back. One sentence, the company's own if it wrote one.</summary>
public record PublicFormResultDto(string Message);
