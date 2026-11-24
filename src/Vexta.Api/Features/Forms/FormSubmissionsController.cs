using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Forms;

/// <summary>
/// Filled copies of one form.
///
/// Anyone who works there may fill one and read what was filled: a form is for the crew, and a
/// crew that cannot see what it reported yesterday will report it again. Deleting a reply is the
/// owner's, because a reply is a record of what somebody said on a given day.
/// </summary>
[ApiController]
[Route("api/formulaires/{formId:guid}/reponses")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class FormSubmissionsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IFormActionRunner actions) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<FormSubmissionDto>>> List(Guid formId, CancellationToken ct)
    {
        if (!await db.FormTemplates.AnyAsync(f => f.Id == formId, ct)) return NotFound();

        var items = await db.FormSubmissions.AsNoTracking()
            .Where(s => s.FormTemplateId == formId)
            .OrderByDescending(s => s.CreatedAt)
            .Select(Fields())
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<FormSubmissionDetailDto>> Get(Guid formId, Guid id, CancellationToken ct)
    {
        var submission = await db.FormSubmissions.AsNoTracking()
            .Where(s => s.Id == id && s.FormTemplateId == formId)
            .Select(Fields())
            .FirstOrDefaultAsync(ct);

        if (submission is null) return NotFound();

        return Ok(new FormSubmissionDetailDto(submission, await AnswersOfAsync(id, ct)));
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<SubmitFormResultDto>> Submit(
        Guid formId, SubmitFormRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var form = await db.FormTemplates.AsNoTracking().FirstOrDefaultAsync(f => f.Id == formId, ct);
        if (form is null) return NotFound();

        // A draft is not offered to be filled. Checked here and not only hidden in the list: a
        // panel left open while somebody unpublished the form would otherwise still file.
        if (!form.IsPublished)
        {
            return BadRequest(new { message = "Ce formulaire n'est pas publié." });
        }

        var fields = await db.FormFields.AsNoTracking()
            .Where(f => f.FormTemplateId == formId)
            .OrderBy(f => f.SortOrder)
            .ToListAsync(ct);

        if (fields.Count == 0) return BadRequest(new { message = "Ce formulaire n'a aucune question." });

        var given = (request.Answers ?? [])
            .GroupBy(a => a.FieldId)
            .ToDictionary(g => g.Key, g => g.Last());

        // Checked against this tenant's own library before anything is written. The ids arrive
        // from the browser, and an answer pointing at another company's file would put that
        // file's name -- and a link to it -- on this company's submission.
        var wantedAssets = given.Values
            .Select(a => a.MediaAssetId)
            .OfType<Guid>()
            .Distinct()
            .ToList();

        var assets = wantedAssets.Count == 0
            ? []
            : await db.MediaAssets.AsNoTracking()
                .Where(m => wantedAssets.Contains(m.Id) && m.TenantId == tenantId)
                .Select(m => new { m.Id, m.FileName })
                .ToDictionaryAsync(m => m.Id, m => m.FileName, ct);

        if (assets.Count != wantedAssets.Count)
        {
            return BadRequest(new { message = "Un des fichiers joints n'existe plus." });
        }

        // Validated against the questions rather than against what was sent: a field left out
        // of the payload altogether is a field left empty, and a required one has to say so.
        foreach (var field in fields)
        {
            given.TryGetValue(field.Id, out var answer);
            var value = TextOf(field, answer, assets);
            if (FormAnswerRules.Problem(field, value) is { } problem) return BadRequest(new { message = problem });
        }

        var submission = new FormSubmission
        {
            TenantId = tenantId,
            FormTemplateId = formId,
            SubmittedByUserId = currentUser.UserId,
            SubmittedByName = await MyNameAsync(ct)
        };

        db.FormSubmissions.Add(submission);

        for (var index = 0; index < fields.Count; index++)
        {
            var field = fields[index];
            given.TryGetValue(field.Id, out var answer);

            db.FormAnswers.Add(new FormAnswer
            {
                TenantId = tenantId,
                SubmissionId = submission.Id,
                FormFieldId = field.Id,
                // Copies, not references: renaming the question next spring must not rewrite
                // what was answered today.
                Label = field.Label,
                Type = field.Type,
                Value = Clean(TextOf(field, answer, assets)),
                MediaAssetId = field.Type == FormFieldType.Fichier ? answer?.MediaAssetId : null,
                SortOrder = index
            });
        }

        await db.SaveChangesAsync(ct);

        // After the answers are safely down, never before: an action that fails must not cost
        // somebody the twelve questions they just filled on a roof.
        var log = await actions.RunAsync(submission, ct);
        if (log is not null)
        {
            var tracked = await db.FormSubmissions.FirstAsync(s => s.Id == submission.Id, ct);
            tracked.ActionLog = log.Length > 1000 ? log[..1000] : log;
            await db.SaveChangesAsync(ct);
        }

        var saved = await db.FormSubmissions.AsNoTracking()
            .Where(s => s.Id == submission.Id)
            .Select(Fields())
            .FirstAsync(ct);

        var message = string.IsNullOrWhiteSpace(form.SuccessMessage)
            ? "Merci, le formulaire est enregistré."
            : form.SuccessMessage;

        return Ok(new SubmitFormResultDto(
            new FormSubmissionDetailDto(saved, await AnswersOfAsync(submission.Id, ct)),
            message,
            log));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid formId, Guid id, CancellationToken ct)
    {
        var submission = await db.FormSubmissions
            .FirstOrDefaultAsync(s => s.Id == id && s.FormTemplateId == formId, ct);
        if (submission is null) return NotFound();

        // The client a form brought in stays: the answers are being deleted, not the customer.
        db.FormSubmissions.Remove(submission);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private Task<List<FormAnswerDto>> AnswersOfAsync(Guid submissionId, CancellationToken ct) =>
        db.FormAnswers.AsNoTracking()
            .Where(a => a.SubmissionId == submissionId)
            .OrderBy(a => a.SortOrder)
            .Select(a => new FormAnswerDto(
                a.Id, a.FormFieldId, a.Label, a.Type, a.Value, a.MediaAssetId, a.SortOrder))
            .ToListAsync(ct);

    private static System.Linq.Expressions.Expression<Func<FormSubmission, FormSubmissionDto>> Fields() =>
        s => new FormSubmissionDto(
            s.Id,
            s.FormTemplateId,
            s.FormTemplate!.Title,
            s.SubmittedByName,
            s.FromPublicPage,
            s.CreatedClientId,
            s.CreatedClient == null ? null : s.CreatedClient.Name,
            s.CreatedClientAssetId,
            s.CreatedClientAsset == null ? null : s.CreatedClientAsset.Label,
            s.ActionLog,
            s.Answers.Count,
            s.CreatedAt,
            s.FormTemplate!.Kind,
            s.CreatedQuoteId,
            s.CreatedQuote == null ? null : s.CreatedQuote.Number);

    /// <summary>
    /// The name to write on the reply. The employee record first, because that is the name the
    /// company uses for them; the account's own as a fallback for somebody with no employee row.
    /// </summary>
    private async Task<string?> MyNameAsync(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return null;

        var employee = await db.Employees.AsNoTracking()
            .Where(e => e.UserId == userId)
            .Select(e => new { e.FirstName, e.LastName })
            .FirstOrDefaultAsync(ct);

        if (employee is not null) return $"{employee.FirstName} {employee.LastName}".Trim();

        var account = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.FirstName, u.LastName, u.Email })
            .FirstOrDefaultAsync(ct);

        if (account is null) return null;

        return $"{account.FirstName} {account.LastName}".Trim() is { Length: > 0 } name ? name : account.Email;
    }

    /// <summary>
    /// The text to store for an answer.
    ///
    /// For a Fichier it is the uploaded file's own name, read from the asset we just verified
    /// and never from what the caller typed: otherwise a submission could claim a file is
    /// called whatever its sender wanted it to say.
    /// </summary>
    private static string? TextOf(
        FormField field,
        SubmitFormAnswer? answer,
        IReadOnlyDictionary<Guid, string> assets)
    {
        if (field.Type != FormFieldType.Fichier) return answer?.Value;

        return answer?.MediaAssetId is { } assetId && assets.TryGetValue(assetId, out var fileName)
            ? fileName
            : null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

}
