using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Forms;

namespace Vexta.Api.Services;

public interface IFormActionRunner
{
    /// <summary>
    /// Runs what a filled form sets off, and says what happened in one sentence per action.
    ///
    /// Never throws. The answers are already saved by the time this runs, and losing them
    /// because an e-mail server was down would be the wrong trade — a crew that filled a
    /// twelve-question inspection sheet on a roof does not get to fill it again. A failure is
    /// written into the log instead, where the office can see it and act.
    /// </summary>
    Task<string?> RunAsync(FormSubmission submission, CancellationToken ct = default);
}

public class FormActionRunner(
    VextaDbContext db,
    IMailgunService mailgun,
    ILogger<FormActionRunner> logger) : IFormActionRunner
{
    public async Task<string?> RunAsync(FormSubmission submission, CancellationToken ct = default)
    {
        var actions = await db.FormActions.AsNoTracking()
            .Where(a => a.FormTemplateId == submission.FormTemplateId && a.IsActive)
            .OrderBy(a => a.SortOrder)
            .ToListAsync(ct);

        if (actions.Count == 0) return null;

        var form = await db.FormTemplates.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == submission.FormTemplateId, ct);
        if (form is null) return null;

        var answers = await db.FormAnswers.AsNoTracking()
            .Where(a => a.SubmissionId == submission.Id)
            .OrderBy(a => a.SortOrder)
            .ToListAsync(ct);

        var log = new List<string>();

        foreach (var action in actions)
        {
            try
            {
                log.Add(action.Kind switch
                {
                    FormActionKind.EnvoyerCourriel => await SendAsync(form, action, submission, answers, ct),
                    FormActionKind.CreerClient => await CreateClientAsync(form, action, submission, answers, ct),
                    _ => "Action inconnue, ignorée."
                });
            }
            catch (Exception ex)
            {
                // Logged for us and said plainly to them. "Quelque chose a échoué" sends somebody
                // to the telephone; naming the action tells them what to do instead.
                logger.LogError(ex, "Action {Kind} du formulaire {FormId} impossible.", action.Kind, form.Id);
                log.Add(action.Kind == FormActionKind.EnvoyerCourriel
                    ? "L'envoi du courriel a échoué. Les réponses sont enregistrées."
                    : "La création du client a échoué. Les réponses sont enregistrées.");
            }
        }

        return string.Join(" ", log);
    }

    private async Task<string> SendAsync(
        FormTemplate form,
        FormAction action,
        FormSubmission submission,
        IReadOnlyList<FormAnswer> answers,
        CancellationToken ct)
    {
        var recipients = FormRecipients.Split(action.Recipients);
        if (recipients.Count == 0) return "Aucun destinataire configuré : rien n'a été envoyé.";

        if (!await mailgun.IsConfiguredAsync(ct))
        {
            return "Les courriels ne sont pas configurés sur la plateforme : rien n'a été envoyé.";
        }

        // The company's own name beside the address, so an inspection sheet from Construction
        // Tremblay arrives from Construction Tremblay. The address stays ours — Mailgun will not
        // send as a domain it does not hold.
        var companyName = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == form.TenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct);

        var subject = string.IsNullOrWhiteSpace(action.Subject) ? form.Title : action.Subject.Trim();
        var body = Body(form, submission, answers);

        // The first address is the recipient and the rest are in copy, which is what makes one
        // message rather than five and lets everyone see who else was told.
        await mailgun.SendWithAttachmentsAsync(
            recipients[0],
            recipients[0],
            subject,
            body,
            recipients.Skip(1).ToList(),
            [],
            ct,
            companyName);

        return recipients.Count == 1
            ? $"Courriel envoyé à {recipients[0]}."
            : $"Courriel envoyé à {recipients.Count} destinataires.";
    }

    /// <summary>
    /// A client built from whichever answers were pointed at one of its fields.
    ///
    /// An entreprise when a company name came back, a particulier otherwise: the type decides
    /// which name the rest of the application shows, and guessing wrong puts a person's name
    /// where a company's belongs on every invoice afterwards.
    /// </summary>
    private async Task<string> CreateClientAsync(
        FormTemplate form,
        FormAction action,
        FormSubmission submission,
        IReadOnlyList<FormAnswer> answers,
        CancellationToken ct)
    {
        // The mapping lives on the question, not on the answer, so the targets are read once as
        // a dictionary — one query rather than one per field.
        var targets = await db.FormFields.AsNoTracking()
            .Where(f => f.FormTemplateId == form.Id && f.Target != FormFieldTarget.Aucun)
            .Select(f => new { f.Id, f.Target })
            .ToListAsync(ct);

        var byTarget = targets
            .GroupBy(t => t.Target)
            .ToDictionary(
                g => g.Key,
                g => answers
                    .Where(a => a.FormFieldId is { } id && g.Any(t => t.Id == id))
                    .Select(a => a.Value)
                    .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)));

        string? Value(FormFieldTarget target) =>
            byTarget.TryGetValue(target, out var value) && !string.IsNullOrWhiteSpace(value)
                ? value.Trim()
                : null;

        var companyName = Value(FormFieldTarget.NomEntreprise);
        var firstName = Value(FormFieldTarget.Prenom);
        var lastName = Value(FormFieldTarget.Nom);

        var type = companyName is not null ? ClientType.Entreprise : ClientType.Particulier;
        var displayName = companyName ?? $"{firstName} {lastName}".Trim();

        if (string.IsNullOrWhiteSpace(displayName))
        {
            return "Aucun nom dans les réponses : le client n'a pas été créé.";
        }

        // Sequential within the tenant, like every client. The same arithmetic as
        // ClientsController.NextNumberAsync, and deliberately not shared with it: a number is
        // handed out inside one SaveChanges, and the unique index is what catches a race.
        var nextNumber = await db.Clients.IgnoreQueryFilters()
            .Where(c => c.TenantId == form.TenantId)
            .MaxAsync(c => (int?)c.Number, ct) ?? 0;

        var notes = new List<string>();
        if (Value(FormFieldTarget.Notes) is { } mappedNotes) notes.Add(mappedNotes);

        // Where they came from, written on the record. Six months later nobody remembers, and
        // "d'où sort ce client" is the question somebody always asks.
        notes.Add($"Créé par le formulaire « {form.Title} » le {BusinessDay.Today:d MMMM yyyy}.");

        var client = new Client
        {
            TenantId = form.TenantId,
            Number = nextNumber + 1,
            Type = type,
            CompanyName = companyName,
            FirstName = firstName,
            LastName = lastName,
            Name = displayName,
            Email = Value(FormFieldTarget.Courriel),
            Phone = Value(FormFieldTarget.Telephone),
            Notes = string.Join("\n\n", notes),
            Status = action.NewClientStatus
        };

        db.Clients.Add(client);

        var tracked = await db.FormSubmissions.FirstOrDefaultAsync(s => s.Id == submission.Id, ct);
        if (tracked is not null) tracked.CreatedClientId = client.Id;

        await db.SaveChangesAsync(ct);

        return $"Client C-{client.Number:0000} créé ({displayName}).";
    }

    /// <summary>
    /// The answers as a readable message: the questions in the order they were asked, each with
    /// what was answered. A table rather than a list, because that is what survives being
    /// forwarded and printed.
    /// </summary>
    private static string Body(FormTemplate form, FormSubmission submission, IReadOnlyList<FormAnswer> answers)
    {
        var html = new StringBuilder();
        html.Append($"<p><strong>{Encode(form.Title)}</strong></p>");

        var who = string.IsNullOrWhiteSpace(submission.SubmittedByName)
            ? "Rempli"
            : $"Rempli par {Encode(submission.SubmittedByName)}";
        html.Append($"<p>{who} le {submission.CreatedAt.ToLocalTime():d MMMM yyyy} à {submission.CreatedAt.ToLocalTime():HH\\:mm}.</p>");

        html.Append("<table cellpadding=\"6\" cellspacing=\"0\" border=\"0\">");
        foreach (var answer in answers)
        {
            var value = string.IsNullOrWhiteSpace(answer.Value) ? "—" : Encode(answer.Value).Replace("\n", "<br>");
            html.Append($"<tr><td valign=\"top\"><strong>{Encode(answer.Label)}</strong></td><td valign=\"top\">{value}</td></tr>");
        }
        html.Append("</table>");

        return html.ToString();
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);
}
