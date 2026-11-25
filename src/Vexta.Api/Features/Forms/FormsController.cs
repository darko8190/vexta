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
public class FormsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    Vexta.Api.Services.IMailgunService mail,
    FormInvitation invitation,
    IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<FormTemplateDto>>> List(CancellationToken ct)
    {
        // The starting forms, made the first time anybody at the company opens the list.
        if (currentUser.TenantId is { } tenantId) await BaseForms.EnsureAsync(db, tenantId, ct);

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
                f.Kind,
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

    /// <summary>
    /// The form's own link (/f/{id}), which works without the company's public page: plenty of
    /// companies never open that page, and sharing one form must not oblige them to. When the
    /// link would not work yet, the reason is named instead, so a copied link is a working one.
    /// </summary>
    [HttpGet("{id:guid}/lien")]
    public async Task<ActionResult<FormPublicLinkDto>> PublicLink(Guid id, CancellationToken ct)
    {
        var (found, missing) = await LinkProblemAsync(id, ct);
        if (!found) return NotFound();

        return Ok(missing is null
            ? new FormPublicLinkDto(LinkPath(id), null)
            : new FormPublicLinkDto(null, missing));
    }

    /// <summary>
    /// Sends the form's link to one person by e-mail, from the company's name. The address is
    /// typed by whoever sends it: a form often goes to somebody who is not a client yet.
    /// </summary>
    [HttpPost("{id:guid}/envoyer")]
    public async Task<ActionResult<SendFormLinkResultDto>> SendLink(Guid id, SendFormLinkRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var (found, missing) = await LinkProblemAsync(id, ct);
        if (!found) return NotFound();
        if (missing is not null) return BadRequest(new { message = missing });

        var to = request.Email?.Trim() ?? "";
        if (!System.Net.Mail.MailAddress.TryCreate(to, out var parsed) || parsed.Address != to || to.Length > 254)
        {
            return BadRequest(new { message = "Indiquez une adresse courriel valide." });
        }

        var message = request.Message?.Trim();
        if (message is { Length: > 2000 }) return BadRequest(new { message = "Le message ne peut pas dépasser 2000 caractères." });

        var form = await db.FormTemplates.Where(f => f.Id == id)
            .Select(f => new { f.Title, f.RequiresIdentification }).FirstAsync(ct);

        // Who the address belongs to, kept on the record of the send whatever the form: the list
        // reads "Constructions Lafleur" rather than an address somebody has to recognise.
        var client = await FormInvitation.ClientForAsync(db, tenantId, to, ct);
        var sender = await db.Users.AsNoTracking()
            .Where(u => u.Id == currentUser.UserId)
            .Select(u => (u.FirstName + " " + u.LastName).Trim())
            .FirstOrDefaultAsync(ct);

        var share = new FormShare
        {
            TenantId = tenantId,
            FormTemplateId = id,
            Email = to,
            ClientId = client?.Id,
            Message = string.IsNullOrEmpty(message) ? null : message,
            SentByName = string.IsNullOrWhiteSpace(sender) ? null : sender
        };

        var name = string.IsNullOrWhiteSpace(request.Name) ? client?.Name ?? to : request.Name.Trim();
        if (await MailShareAsync(share, form.Title, name, ct) is { } failure) return failure;

        // Saved only once it has left: a row for a message that never went would be a client
        // shown as "en attente" for a form they never received.
        db.FormShares.Add(share);
        await db.SaveChangesAsync(ct);

        return Ok(new SendFormLinkResultDto(form.RequiresIdentification ? client?.Name : null, form.RequiresIdentification));
    }

    /// <summary>
    /// The forms sent so far, newest first: for one form, for one client, or both. Whether each
    /// came back is read from the link it carried.
    /// </summary>
    [HttpGet("envois")]
    public async Task<ActionResult<List<FormShareDto>>> Shares(
        [FromQuery] Guid? formId, [FromQuery] Guid? clientId, CancellationToken ct)
    {
        var shares = db.FormShares.AsNoTracking();
        if (formId is { } f) shares = shares.Where(x => x.FormTemplateId == f);
        if (clientId is { } c) shares = shares.Where(x => x.ClientId == c);

        return Ok(await shares
            .OrderByDescending(x => x.LastSentAt)
            .Take(200)
            .Select(x => new FormShareDto(
                x.Id, x.FormTemplateId, x.FormTemplate!.Title, x.Email, x.ClientId,
                x.Client != null ? x.Client.Name : null, x.SentByName, x.SentAt, x.LastSentAt,
                x.SendCount, x.AnsweredAt))
            .ToListAsync(ct));
    }

    /// <summary>
    /// The same message again, with the same link, to the same address: a nudge for somebody
    /// who has not answered yet.
    /// </summary>
    [HttpPost("envois/{shareId:guid}/renvoyer")]
    public async Task<ActionResult<FormShareDto>> Resend(Guid shareId, CancellationToken ct)
    {
        var share = await db.FormShares.Include(x => x.Client).FirstOrDefaultAsync(x => x.Id == shareId, ct);
        if (share is null) return NotFound();

        if (share.AnsweredAt is not null)
        {
            return BadRequest(new { message = "Ce formulaire a déjà été rempli par cette personne." });
        }

        var (_, missing) = await LinkProblemAsync(share.FormTemplateId, ct);
        if (missing is not null) return BadRequest(new { message = missing });

        var title = await db.FormTemplates.Where(f => f.Id == share.FormTemplateId).Select(f => f.Title).FirstAsync(ct);
        if (await MailShareAsync(share, title, share.Client?.Name ?? share.Email, ct) is { } failure) return failure;

        share.LastSentAt = DateTimeOffset.UtcNow;
        share.SendCount++;
        await db.SaveChangesAsync(ct);

        return Ok(new FormShareDto(
            share.Id, share.FormTemplateId, title, share.Email, share.ClientId, share.Client?.Name,
            share.SentByName, share.SentAt, share.LastSentAt, share.SendCount, share.AnsweredAt));
    }

    /// <summary>
    /// Sends one share's message. The link carries the address and the share's id, signed: the
    /// first lets a form that files on a client's record open on it without a sign-in, the
    /// second marks this share answered when the reply comes back. Null when it left.
    /// </summary>
    private async Task<ObjectResult?> MailShareAsync(FormShare share, string title, string name, CancellationToken ct)
    {
        var companyName = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == share.TenantId).Select(t => t.Name).FirstAsync(ct);
        var token = invitation.Seal(share.FormTemplateId, share.Email, share.Id);
        var url = $"{FrontendUrl}{LinkPath(share.FormTemplateId)}?jeton={Uri.EscapeDataString(token)}";

        try
        {
            await mail.SendAsync(
                share.Email,
                name,
                $"{title} — {companyName}",
                FormLinkEmail.Build(companyName, title, share.Message, url),
                ct,
                fromName: companyName);
            return null;
        }
        catch (InvalidOperationException ex)
        {
            // Mailgun is unconfigured or refused it. Said plainly: a "sent" toast here would
            // leave the office waiting for answers to a form nobody received.
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
    }

    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    private static string LinkPath(Guid id) => $"/f/{id}";

    /// <summary>
    /// Whether the form exists, and why its link would not work yet (null when it does). The same checks as the public side
    /// (PublicFormGate.ResolveSharedAsync), said in words the office can act on.
    /// </summary>
    private async Task<(bool Found, string? Missing)> LinkProblemAsync(Guid id, CancellationToken ct)
    {
        var form = await db.FormTemplates.AsNoTracking()
            .Where(f => f.Id == id)
            .Select(f => new
            {
                f.IsPublished,
                HasQuestions = db.FormFields.Any(x => x.FormTemplateId == f.Id),
                AsksForFile = db.FormFields.Any(x => x.FormTemplateId == f.Id && x.Type == FormFieldType.Fichier)
            })
            .FirstOrDefaultAsync(ct);

        if (form is null) return (false, null);

        return (true, !form.IsPublished ? "Publiez le formulaire pour obtenir son lien."
            : !form.HasQuestions ? "Ajoutez au moins une question pour obtenir son lien."
            : form.AsksForFile ? "Ce formulaire demande un fichier : il ne peut pas être rempli par lien, car une personne sans compte ne peut rien téléverser."
            : null);
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
            Kind = Enum.IsDefined(request.Kind) ? request.Kind : FormKind.Defaut,
            IsPublished = false,
            // Nor on the public page, for the same reason: it has no questions yet, and the
            // page would be offering strangers a form that asks nothing.
            ShowOnPublicPage = false,
            SortOrder = request.SortOrder,
            RequiresIdentification = request.RequiresIdentification
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

        // A visitor with no account has nowhere to upload to: the media routes need a session,
        // and a company's library is not a place strangers write. Refused here rather than the
        // question being skipped on the page, because a skipped question is a form that comes
        // back missing the photograph it was built to collect.
        if (request.ShowOnPublicPage
            && await db.FormFields.AnyAsync(f => f.FormTemplateId == id && f.Type == FormFieldType.Fichier, ct))
        {
            return BadRequest(new
            {
                message = "Un formulaire qui demande un fichier ne peut pas être mis sur la page publique : un visiteur sans compte ne peut rien téléverser."
            });
        }

        form.Title = request.Title.Trim();
        form.Description = Clean(request.Description);
        form.SuccessMessage = Clean(request.SuccessMessage);
        form.Kind = Enum.IsDefined(request.Kind) ? request.Kind : FormKind.Defaut;
        form.IsPublished = request.IsPublished;
        form.ShowOnPublicPage = request.ShowOnPublicPage;
        form.SortOrder = request.SortOrder;
        form.RequiresIdentification = request.RequiresIdentification;
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

        // Refused rather than quietly taking the form off the page: whoever is adding the
        // question is not looking at the public-page switch, and a website that stops offering
        // a quote request because somebody added a photograph field is a change nobody saw.
        if (form.ShowOnPublicPage && incoming.Any(f => f.Type == FormFieldType.Fichier))
        {
            return BadRequest(new
            {
                message = "Ce formulaire est sur la page publique : il ne peut pas demander de fichier. Retirez-le de la page, ou changez le type de cette question."
            });
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
        if (incoming.Count == 0)
        {
            form.IsPublished = false;
            form.ShowOnPublicPage = false;
        }
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

        // Checked against this company's own list, not merely for existence: an id arrives from
        // a browser, and a type belonging to another company would file cars under a kind its
        // owner never defined -- and would name that company's word on this company's screen.
        var wantedTypes = incoming.Select(a => a.NewAssetTypeId).OfType<Guid>().Distinct().ToList();

        var knownTypes = wantedTypes.Count == 0
            ? []
            : await db.ClientAssetTypes.AsNoTracking()
                .Where(type => wantedTypes.Contains(type.Id))
                .Select(type => type.Id)
                .ToListAsync(ct);

        if (knownTypes.Count != wantedTypes.Count)
        {
            return BadRequest(new { message = "Ce type d'actif n'existe plus." });
        }

        var createsClient = incoming.Any(a => a.Kind == FormActionKind.CreerClient && a.IsActive);

        foreach (var action in incoming)
        {
            if (Problem(action, targets, createsClient) is { } problem)
            {
                return BadRequest(new { message = problem });
            }
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

            // Cleared when the action is no longer about an asset. A kind of asset left behind
            // on an e-mail action is a setting that does nothing and will confuse whoever reads
            // the row next year.
            target.NewAssetTypeId = source.Kind == FormActionKind.CreerActifClient ? source.NewAssetTypeId : null;
            target.NewAssetUsageUnit = source.Kind == FormActionKind.CreerActifClient
                ? Clean(source.NewAssetUsageUnit)
                : null;

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
            .Select(a => new FormActionDto(
                a.Id,
                a.Kind,
                a.Recipients,
                a.Subject,
                a.NewClientStatus,
                a.NewAssetTypeId,
                a.NewAssetType == null ? null : a.NewAssetType.Name,
                a.NewAssetUsageUnit,
                a.IsActive,
                a.SortOrder))
            .ToListAsync(ct);

    private static System.Linq.Expressions.Expression<Func<FormTemplate, FormTemplateDto>> Fields() =>
        f => new FormTemplateDto(
            f.Id,
            f.Title,
            f.Description,
            f.SuccessMessage,
            f.Kind,
            f.IsPublished,
            f.ShowOnPublicPage,
            f.SortOrder,
            f.Fields.Count,
            f.Actions.Count(a => a.IsActive),
            f.Submissions.Count,
            f.UpdatedAt,
            f.RequiresIdentification);

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

    /// <param name="createsClient">
    /// Whether another action on the same form brings a client in. An asset action needs a
    /// client from somewhere, and this is one of the two places it can come from.
    /// </param>
    private static string? Problem(
        SaveFormActionRequest action, IReadOnlyList<FormFieldTarget> targets, bool createsClient)
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

        if (action.Kind == FormActionKind.CreerActifClient && action.IsActive)
        {
            // The same reasoning as above, and the same three fields the runner builds a label
            // from. A form with none of them files answers and creates nothing.
            if (!targets.Any(t => t is FormFieldTarget.ActifLibelle
                or FormFieldTarget.ActifMarque or FormFieldTarget.ActifModele))
            {
                return "Pour créer un actif, une question doit remplir son libellé, sa marque ou son modèle.";
            }

            // Nothing to hang it on, and nothing on this form will ever produce one. Said now,
            // where it can be fixed, rather than once a week in a log nobody reads.
            if (!targets.Contains(FormFieldTarget.Courriel) && !createsClient)
            {
                return "Pour créer un actif, il faut un client : ajoutez l'action « Créer un client » avant celle-ci, ou une question qui remplit le courriel du client.";
            }

            if (action.NewAssetUsageUnit?.Trim().Length > 20) return "L'unité d'usage est trop longue.";
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
