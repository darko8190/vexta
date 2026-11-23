using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Forms;

/// <summary>
/// The forms a company builds for itself, and what a filled one sets off.
///
/// Read by everyone who works there, because the point of a form is that a crew can fill it on
/// site. Built by the people who run the company: a form with an action attached can send mail
/// and create clients, and that is not something an employee grants themselves.
/// </summary>
[ApiController]
[Route("api/formulaires")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class FormsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<FormTemplateDto>>> List(CancellationToken ct)
    {
        var forms = await db.FormTemplates.AsNoTracking()
            .OrderBy(f => f.SortOrder).ThenBy(f => f.Title)
            .Select(Fields())
            .ToListAsync(ct);

        return Ok(forms);
    }

    /// <summary>
    /// The forms that have been filled, with how many times and how recently.
    ///
    /// The answers are grouped by the form they answer rather than listed flat, because an
    /// answer means nothing without the question: "Oui" is not information until you know it
    /// answered "Le chantier était-il propre au départ ?".
    ///
    /// Forms nobody has filled are returned too, at the bottom, showing zero. A list that hides
    /// them looks like the form was never published when in fact it was never used.
    /// </summary>
    [HttpGet("reponses")]
    public async Task<ActionResult<List<FormResponsesSummaryDto>>> Responses(CancellationToken ct)
    {
        var items = await db.FormTemplates.AsNoTracking()
            .Select(f => new FormResponsesSummaryDto(
                f.Id,
                f.Title,
                f.IsPublished,
                f.Submissions.Count,
                f.Submissions.Max(s => (DateTimeOffset?)s.CreatedAt)))
            .ToListAsync(ct);

        // Ordered here rather than in SQL. Sorting on a projected record is not something EF
        // can translate — it tried to build the whole DTO inside the ORDER BY and gave up — and
        // the list is one row per form, which is a handful even for a company that lives on them.
        return Ok(items
            .OrderByDescending(f => f.LastSubmissionAt.HasValue)
            .ThenByDescending(f => f.LastSubmissionAt)
            .ThenBy(f => f.Title, StringComparer.CurrentCultureIgnoreCase)
            .ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<FormTemplateDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var form = await db.FormTemplates.AsNoTracking().Where(f => f.Id == id)
            .Select(Fields()).FirstOrDefaultAsync(ct);

        if (form is null) return NotFound();

        return Ok(new FormTemplateDetailDto(form, await FieldsOfAsync(id, ct), await ActionsOfAsync(id, ct)));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<FormTemplateDetailDto>> Create(SaveFormTemplateRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        // A new form is never published: it has no questions yet, and publishing it would offer
        // a crew an empty form to fill.
        var form = new FormTemplate
        {
            TenantId = tenantId,
            Title = request.Title.Trim(),
            Description = Clean(request.Description),
            SuccessMessage = Clean(request.SuccessMessage),
            IsPublished = false,
            SortOrder = request.SortOrder
        };

        db.FormTemplates.Add(form);
        await db.SaveChangesAsync(ct);

        return Ok(new FormTemplateDetailDto(await RequireDtoAsync(form.Id, ct), [], []));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<FormTemplateDetailDto>> Update(
        Guid id, SaveFormTemplateRequest request, CancellationToken ct)
    {
        var form = await db.FormTemplates.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (form is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        if (request.IsPublished && !await db.FormFields.AnyAsync(f => f.FormTemplateId == id, ct))
        {
            return BadRequest(new { message = "Ajoutez au moins une question avant de publier ce formulaire." });
        }

        form.Title = request.Title.Trim();
        form.Description = Clean(request.Description);
        form.SuccessMessage = Clean(request.SuccessMessage);
        form.IsPublished = request.IsPublished;
        form.SortOrder = request.SortOrder;
        form.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Ok(new FormTemplateDetailDto(
            await RequireDtoAsync(id, ct), await FieldsOfAsync(id, ct), await ActionsOfAsync(id, ct)));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var form = await db.FormTemplates.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (form is null) return NotFound();

        // Refused once it has been filled, rather than cascading. The answers are a record of
        // what a crew reported on a given day, and the way to retire a form is to unpublish it —
        // which is offered in the same breath, so the refusal is not a dead end.
        var filled = await db.FormSubmissions.CountAsync(s => s.FormTemplateId == id, ct);
        if (filled > 0)
        {
            return Conflict(new
            {
                message = filled == 1
                    ? "Ce formulaire a une réponse. Dépubliez-le plutôt que de le supprimer."
                    : $"Ce formulaire a {filled} réponses. Dépubliez-le plutôt que de le supprimer."
            });
        }

        db.FormTemplates.Remove(form);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// The questions, in the order they are to be asked. The whole list replaces the whole list:
    /// reordering, renaming and deleting are all one save, which is what a builder does.
    /// </summary>
    [HttpPut("{id:guid}/questions")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<FormTemplateDetailDto>> SaveFields(
        Guid id, SaveFormFieldsRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var form = await db.FormTemplates.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (form is null) return NotFound();

        var incoming = request.Fields ?? [];
        if (incoming.Count > 100) return BadRequest(new { message = "Un formulaire de plus de 100 questions ne sera pas rempli." });

        foreach (var field in incoming)
        {
            if (Problem(field) is { } problem) return BadRequest(new { message = problem });
        }

        var existing = await db.FormFields.Where(f => f.FormTemplateId == id).ToListAsync(ct);

        // Deleted first, so a question removed in the same save as a new one with its label does
        // not trip the ordering. The answers already given keep their own copy of the label.
        var keptIds = incoming.Where(f => f.Id is not null).Select(f => f.Id!.Value).ToHashSet();
        db.FormFields.RemoveRange(existing.Where(f => !keptIds.Contains(f.Id)));

        for (var index = 0; index < incoming.Count; index++)
        {
            var source = incoming[index];
            var target = source.Id is { } fieldId ? existing.FirstOrDefault(f => f.Id == fieldId) : null;

            // An id we do not recognise is treated as a new question rather than refused: it can
            // only come from a stale panel, and losing the typing would be the worse answer.
            if (target is null)
            {
                target = new FormField { TenantId = tenantId, FormTemplateId = id, Label = source.Label.Trim() };
                db.FormFields.Add(target);
            }

            target.Label = source.Label.Trim();
            target.HelpText = Clean(source.HelpText);
            target.Type = source.Type;
            target.IsRequired = source.IsRequired;
            target.Options = OptionsOf(source);
            target.Target = source.Target;
            target.SortOrder = index;
        }

        // A form that loses its last question stops being offered: an empty published form is a
        // page that asks nothing and files nothing.
        if (incoming.Count == 0) form.IsPublished = false;
        form.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Ok(new FormTemplateDetailDto(
            await RequireDtoAsync(id, ct), await FieldsOfAsync(id, ct), await ActionsOfAsync(id, ct)));
    }

    /// <summary>What a filled copy sets off. The whole list replaces the whole list, like the questions.</summary>
    [HttpPut("{id:guid}/actions")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<FormTemplateDetailDto>> SaveActions(
        Guid id, SaveFormActionsRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var form = await db.FormTemplates.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (form is null) return NotFound();

        var incoming = request.Actions ?? [];
        if (incoming.Count > 10) return BadRequest(new { message = "Dix actions par formulaire, c'est déjà beaucoup." });

        var targets = await db.FormFields.AsNoTracking()
            .Where(f => f.FormTemplateId == id)
            .Select(f => f.Target)
            .ToListAsync(ct);

        foreach (var action in incoming)
        {
            if (Problem(action, targets) is { } problem) return BadRequest(new { message = problem });
        }

        var existing = await db.FormActions.Where(a => a.FormTemplateId == id).ToListAsync(ct);
        var keptIds = incoming.Where(a => a.Id is not null).Select(a => a.Id!.Value).ToHashSet();
        db.FormActions.RemoveRange(existing.Where(a => !keptIds.Contains(a.Id)));

        for (var index = 0; index < incoming.Count; index++)
        {
            var source = incoming[index];
            var target = source.Id is { } actionId ? existing.FirstOrDefault(a => a.Id == actionId) : null;

            if (target is null)
            {
                target = new FormAction { TenantId = tenantId, FormTemplateId = id };
                db.FormActions.Add(target);
            }

            target.Kind = source.Kind;
            target.Recipients = source.Kind == FormActionKind.EnvoyerCourriel ? Clean(source.Recipients) : null;
            target.Subject = source.Kind == FormActionKind.EnvoyerCourriel ? Clean(source.Subject) : null;
            target.NewClientStatus = source.NewClientStatus;
            target.IsActive = source.IsActive;
            target.SortOrder = index;
        }

        form.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(new FormTemplateDetailDto(
            await RequireDtoAsync(id, ct), await FieldsOfAsync(id, ct), await ActionsOfAsync(id, ct)));
    }

    // ---- reading back ----

    private async Task<FormTemplateDto> RequireDtoAsync(Guid id, CancellationToken ct) =>
        await db.FormTemplates.AsNoTracking().Where(f => f.Id == id).Select(Fields()).FirstAsync(ct);

    /// <summary>
    /// The questions, with their options already split.
    ///
    /// Read as rows and mapped afterwards rather than projected: the options live in one column
    /// and splitting them is a domain method, which no provider translates to SQL.
    /// </summary>
    private async Task<List<FormFieldDto>> FieldsOfAsync(Guid id, CancellationToken ct)
    {
        var fields = await db.FormFields.AsNoTracking()
            .Where(f => f.FormTemplateId == id)
            .OrderBy(f => f.SortOrder)
            .ToListAsync(ct);

        return fields
            .Select(f => new FormFieldDto(
                f.Id, f.Label, f.HelpText, f.Type, f.IsRequired, f.OptionList(), f.Target, f.SortOrder))
            .ToList();
    }

    private Task<List<FormActionDto>> ActionsOfAsync(Guid id, CancellationToken ct) =>
        db.FormActions.AsNoTracking()
            .Where(a => a.FormTemplateId == id)
            .OrderBy(a => a.SortOrder)
            .Select(a => new FormActionDto(a.Id, a.Kind, a.Recipients, a.Subject, a.NewClientStatus, a.IsActive, a.SortOrder))
            .ToListAsync(ct);

    private static System.Linq.Expressions.Expression<Func<FormTemplate, FormTemplateDto>> Fields() =>
        f => new FormTemplateDto(
            f.Id,
            f.Title,
            f.Description,
            f.SuccessMessage,
            f.IsPublished,
            f.SortOrder,
            f.Fields.Count,
            f.Actions.Count(a => a.IsActive),
            f.Submissions.Count,
            f.UpdatedAt);

    // ---- validation ----

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>The offered answers as one column, or null for the types that offer none.</summary>
    private static string? OptionsOf(SaveFormFieldRequest field) =>
        field.Type is FormFieldType.Choix or FormFieldType.MultiChoix
            ? string.Join('\n', (field.Options ?? []).Select(o => o.Trim()).Where(o => o.Length > 0))
            : null;

    private static string? Problem(SaveFormTemplateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title)) return "Le titre du formulaire est obligatoire.";
        if (request.Title.Trim().Length > 200) return "Le titre est trop long.";
        if (request.Description?.Trim().Length > 1000) return "La description est trop longue.";
        if (request.SuccessMessage?.Trim().Length > 500) return "Le message de confirmation est trop long.";
        return null;
    }

    private static string? Problem(SaveFormFieldRequest field)
    {
        if (string.IsNullOrWhiteSpace(field.Label)) return "Chaque question a besoin d'un libellé.";
        if (field.Label.Trim().Length > 300) return $"Le libellé « {field.Label.Trim()[..40]}… » est trop long.";
        if (field.HelpText?.Trim().Length > 300) return "Le texte d'aide est trop long.";

        if (field.Type is FormFieldType.Choix or FormFieldType.MultiChoix)
        {
            var options = (field.Options ?? []).Select(o => o.Trim()).Where(o => o.Length > 0).ToList();

            // Two, not one: a single-option choice is a question with one answer, which is not a
            // question. And the stored column has a ceiling, so the list cannot be endless.
            if (options.Count < 2) return $"« {field.Label.Trim()} » a besoin d'au moins deux choix.";
            if (options.Any(o => o.Length > 200)) return "Un choix ne peut pas dépasser 200 caractères.";
            if (string.Join('\n', options).Length > 2000) return $"Il y a trop de choix sur « {field.Label.Trim()} ».";
            if (options.Select(o => o.ToLowerInvariant()).Distinct().Count() != options.Count)
            {
                return $"Deux choix identiques sur « {field.Label.Trim()} ».";
            }
        }

        return null;
    }

    private static string? Problem(SaveFormActionRequest action, IReadOnlyList<FormFieldTarget> targets)
    {
        if (action.Kind == FormActionKind.EnvoyerCourriel)
        {
            var recipients = FormRecipients.Split(action.Recipients);
            if (recipients.Count == 0) return "Indiquez au moins une adresse où envoyer les réponses.";
            if (recipients.Count > 10) return "Dix destinataires au maximum.";

            var bad = recipients.FirstOrDefault(r => !r.Contains('@') || r.StartsWith('@') || r.EndsWith('@'));
            if (bad is not null) return $"« {bad} » n'est pas une adresse courriel.";
            if (action.Subject?.Trim().Length > 200) return "L'objet est trop long.";
        }

        // Checked here rather than left to fail at submission time: a form configured to create
        // a client, with nothing that could be its name, would file answers and create nothing
        // while looking like it worked.
        if (action.Kind == FormActionKind.CreerClient && action.IsActive
            && !targets.Any(t => t is FormFieldTarget.Nom or FormFieldTarget.NomEntreprise))
        {
            return "Pour créer un client, une question doit remplir son nom ou le nom de son entreprise.";
        }

        return null;
    }
}

/// <summary>
/// The recipients of a form's e-mail, as people type them: separated by commas, semicolons or
/// whitespace. Written once because both the save and the send have to agree about it.
/// </summary>
public static class FormRecipients
{
    public static IReadOnlyList<string> Split(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? []
            : value.Split([',', ';', ' ', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
}
