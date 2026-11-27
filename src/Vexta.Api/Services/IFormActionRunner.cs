using System.Globalization;
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
    /// <param name="fromEmailedLink">
    /// Filled through a link the company e-mailed: the company chose to write to this person, so
    /// a client created from it is a client, not a prospect.
    /// </param>
    Task<string?> RunAsync(FormSubmission submission, CancellationToken ct = default, bool fromEmailedLink = false);
}

public class FormActionRunner(
    VextaDbContext db,
    IMailgunService mailgun,
    ILogger<FormActionRunner> logger) : IFormActionRunner
{
    public async Task<string?> RunAsync(FormSubmission submission, CancellationToken ct = default, bool fromEmailedLink = false)
    {
        // Every read here ignores the query filters and names the tenant from the submission
        // instead.
        //
        // Not an optimisation: the filters resolve against the signed-in tenant, and this runs
        // where there is not always one. A job application arrives from somebody's personal
        // account, and a public form from nobody at all — in both cases the filtered queries
        // compared against null, found no actions, and the form quietly did nothing. The tenant
        // is right there on the submission, which is the authority that matters.
        var actions = await db.FormActions.IgnoreQueryFilters().AsNoTracking()
            .Where(a => a.FormTemplateId == submission.FormTemplateId
                && a.TenantId == submission.TenantId
                && a.IsActive)
            .OrderBy(a => a.SortOrder)
            .ToListAsync(ct);

        if (actions.Count == 0) return null;

        var form = await db.FormTemplates.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == submission.FormTemplateId
                && f.TenantId == submission.TenantId, ct);
        if (form is null) return null;

        var answers = await db.FormAnswers.IgnoreQueryFilters().AsNoTracking()
            .Where(a => a.SubmissionId == submission.Id && a.TenantId == submission.TenantId)
            .OrderBy(a => a.SortOrder)
            .ToListAsync(ct);

        // Read once and shared by the actions that need it: the mapping lives on the questions,
        // and two actions on one form would otherwise ask the same question of the database twice.
        var targets = await TargetsAsync(form.Id, answers, ct);

        var log = new List<string>();

        // The client an earlier action created, carried to a later one. This is the whole reason
        // the actions are ordered and the loop is a statement rather than an expression: a form
        // that brings in a customer and files their car does both in one submission, and the car
        // has to land on the customer that was just created and not on a second copy of them.
        Guid? createdClientId = null;

        foreach (var action in actions)
        {
            try
            {
                switch (action.Kind)
                {
                    case FormActionKind.EnvoyerCourriel:
                        log.Add(await SendAsync(form, action, submission, answers, ct));
                        break;

                    case FormActionKind.CreerClient:
                    {
                        var (line, clientId) = await CreateClientAsync(form, action, submission, targets, fromEmailedLink, ct);
                        createdClientId ??= clientId;
                        log.Add(line);
                        break;
                    }

                    case FormActionKind.CreerActifClient:
                        log.Add(await CreateAssetAsync(form, action, submission, targets, createdClientId, ct));
                        break;

                    default:
                        log.Add("Action inconnue, ignorée.");
                        break;
                }
            }
            catch (Exception ex)
            {
                // Logged for us and said plainly to them. "Quelque chose a échoué" sends somebody
                // to the telephone; naming the action tells them what to do instead.
                logger.LogError(ex, "Action {Kind} du formulaire {FormId} impossible.", action.Kind, form.Id);
                log.Add(action.Kind switch
                {
                    FormActionKind.EnvoyerCourriel => "L'envoi du courriel a échoué. Les réponses sont enregistrées.",
                    FormActionKind.CreerActifClient => "La création de l'actif a échoué. Les réponses sont enregistrées.",
                    _ => "La création du client a échoué. Les réponses sont enregistrées."
                });
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
    /// The answers that were pointed at a field of a client or of its asset, by target.
    ///
    /// The mapping lives on the question and not on the answer, so it is read once as a
    /// dictionary — one query rather than one per field — and the first non-empty answer wins
    /// where two questions claim the same target.
    /// </summary>
    private async Task<Dictionary<FormFieldTarget, string>> TargetsAsync(
        Guid formId, IReadOnlyList<FormAnswer> answers, CancellationToken ct)
    {
        var mapped = await db.FormFields.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.FormTemplateId == formId && f.Target != FormFieldTarget.Aucun)
            .Select(f => new { f.Id, f.Target })
            .ToListAsync(ct);

        var byTarget = new Dictionary<FormFieldTarget, string>();

        foreach (var group in mapped.GroupBy(m => m.Target))
        {
            var value = answers
                .Where(a => a.FormFieldId is { } id && group.Any(m => m.Id == id))
                .Select(a => a.Value)
                .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

            if (value is not null) byTarget[group.Key] = value.Trim();
        }

        return byTarget;
    }

    /// <summary>
    /// A client built from whichever answers were pointed at one of its fields.
    ///
    /// An entreprise when a company name came back, a particulier otherwise: the type decides
    /// which name the rest of the application shows, and guessing wrong puts a person's name
    /// where a company's belongs on every invoice afterwards.
    /// </summary>
    /// <returns>The sentence for the log, and the client's id when one was created.</returns>
    private async Task<(string Line, Guid? ClientId)> CreateClientAsync(
        FormTemplate form,
        FormAction action,
        FormSubmission submission,
        IReadOnlyDictionary<FormFieldTarget, string> targets,
        bool fromEmailedLink,
        CancellationToken ct)
    {
        string? Value(FormFieldTarget target) => targets.GetValueOrDefault(target);

        var companyName = Value(FormFieldTarget.NomEntreprise);
        var firstName = Value(FormFieldTarget.Prenom);
        var lastName = Value(FormFieldTarget.Nom);

        var type = companyName is not null ? ClientType.Entreprise : ClientType.Particulier;
        var displayName = companyName ?? $"{firstName} {lastName}".Trim();

        if (string.IsNullOrWhiteSpace(displayName))
        {
            return ("Aucun nom dans les réponses : le client n'a pas été créé.", null);
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
            Status = fromEmailedLink ? ClientStatus.Client : action.NewClientStatus
        };

        db.Clients.Add(client);

        // The address they gave, as the client's primary billing address: the same row the
        // client sheet's own address fields write, so it shows in the client's list of addresses.
        if (Value(FormFieldTarget.AdresseRue) is { } line1)
        {
            db.Addresses.Add(new Address
            {
                TenantId = form.TenantId,
                ClientId = client.Id,
                Type = AddressType.Facturation,
                IsPrimary = true,
                Line1 = line1,
                Line2 = Value(FormFieldTarget.AdresseComplement),
                City = Value(FormFieldTarget.AdresseVille) ?? "",
                Province = Value(FormFieldTarget.AdresseProvince),
                PostalCode = Value(FormFieldTarget.AdresseCodePostal)?.ToUpperInvariant() ?? "",
                Country = "Canada"
            });
        }

        // The person who filled it is the client's first contact, as when the office creates a
        // client by hand: pickable as a project's contact or its billing contact straight away.
        if (firstName is not null || lastName is not null)
        {
            db.ClientContacts.Add(new ClientContact
            {
                TenantId = form.TenantId,
                ClientId = client.Id,
                FirstName = firstName ?? "",
                LastName = lastName ?? "",
                Email = client.Email,
                Phone = client.Phone
            });
        }

        var tracked = await db.FormSubmissions.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == submission.Id && s.TenantId == form.TenantId, ct);
        if (tracked is not null) tracked.CreatedClientId = client.Id;

        await db.SaveChangesAsync(ct);

        return ($"Client C-{client.Number:0000} créé ({displayName}).", client.Id);
    }

    /// <summary>
    /// An asset filed against a client: the car dropped off this morning, the building somebody
    /// asked to have looked at.
    ///
    /// It needs a client, and finding one is most of the work — see <see cref="ClientForAssetAsync"/>.
    /// Nothing is invented: no client and no asset, said in the log, because an asset belonging
    /// to nobody is a row nobody will ever find again.
    /// </summary>
    private async Task<string> CreateAssetAsync(
        FormTemplate form,
        FormAction action,
        FormSubmission submission,
        IReadOnlyDictionary<FormFieldTarget, string> targets,
        Guid? createdClientId,
        CancellationToken ct)
    {
        string? Value(FormFieldTarget target) => targets.GetValueOrDefault(target);

        var label = Value(FormFieldTarget.ActifLibelle);
        var make = Value(FormFieldTarget.ActifMarque);
        var model = Value(FormFieldTarget.ActifModele);

        // The label falls back to what the thing is, which is how a shop would have written it
        // anyway: "Toyota Corolla 2018". A row called nothing is a row nobody can pick from a
        // list, so this is the one answer the action cannot do without.
        if (label is null)
        {
            var built = string.Join(" ", new[] { make, model, Value(FormFieldTarget.ActifAnnee) }
                .Where(part => !string.IsNullOrWhiteSpace(part)));

            label = built.Length > 0 ? built : null;
        }

        if (label is null)
        {
            return "Aucun libellé, marque ni modèle dans les réponses : l'actif n'a pas été créé.";
        }

        var client = await ClientForAssetAsync(form, submission, targets, createdClientId, ct);
        if (client is null)
        {
            return "Aucun client à rattacher : l'actif n'a pas été créé. Ajoutez l'action « Créer un client » avant celle-ci, ou une question qui remplit le courriel du client.";
        }

        // Re-checked against this company's own list even though the save validated it: this is
        // the one place that writes, and a type belonging to another company would file the car
        // under a kind its owner never defined.
        Guid? assetTypeId = null;
        if (action.NewAssetTypeId is { } wantedType
            && await db.ClientAssetTypes.IgnoreQueryFilters().AsNoTracking()
                .AnyAsync(t => t.Id == wantedType && t.TenantId == form.TenantId, ct))
        {
            assetTypeId = wantedType;
        }

        var notes = new List<string>();
        if (Value(FormFieldTarget.ActifNotes) is { } mappedNotes) notes.Add(mappedNotes);

        // Anything typed that could not be read as a number is written down rather than dropped.
        // "2018 ou 2019" is an answer somebody gave, and losing it silently is worse than
        // carrying it as a note the shop can sort out at the counter.
        var year = ParseYear(Value(FormFieldTarget.ActifAnnee));
        var usage = ParseDecimal(Value(FormFieldTarget.ActifUsage));

        if (Value(FormFieldTarget.ActifAnnee) is { } rawYear && year is null)
        {
            notes.Add($"Année indiquée : {rawYear}");
        }

        if (Value(FormFieldTarget.ActifUsage) is { } rawUsage && usage is null)
        {
            notes.Add($"Usage indiqué : {rawUsage}");
        }

        notes.Add($"Créé par le formulaire « {form.Title} » le {BusinessDay.Today:d MMMM yyyy}.");

        var asset = new ClientAsset
        {
            TenantId = form.TenantId,
            ClientId = client.Id,
            // Not null: the guard above returned when there was nothing to call it.
            Label = Cap(label, 200)!,
            AssetTypeId = assetTypeId,
            Make = Cap(make, 80),
            Model = Cap(model, 80),
            Year = year,
            SerialNumber = Cap(Value(FormFieldTarget.ActifNumeroSerie), 80),
            Reference = Cap(Value(FormFieldTarget.ActifReference), 60),
            Usage = usage,
            // The unit only ever accompanies a figure: "km" on its own says nothing.
            UsageUnit = usage is null ? null : Cap(action.NewAssetUsageUnit, 20),
            Notes = string.Join("\n\n", notes)
        };

        db.ClientAssets.Add(asset);

        var tracked = await db.FormSubmissions.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == submission.Id && s.TenantId == form.TenantId, ct);
        if (tracked is not null) tracked.CreatedClientAssetId = asset.Id;

        await db.SaveChangesAsync(ct);

        return $"Actif « {asset.Label} » créé pour {client.Name}.";
    }

    /// <summary>
    /// Which client the asset belongs to, tried three ways and in this order.
    ///
    /// First the client this very submission just created — a sheet that brings in a customer
    /// and their vehicle files the vehicle on the customer it has, not on a second copy.
    ///
    /// Then the client whose courriel came back in the answers, matched case-insensitively. This
    /// is what makes a public « Fiche véhicule » work: a regular who fills it in gets their car
    /// added to their own file instead of a stranger's.
    ///
    /// Then the client whose own account filled the form, for a customer signed in to Vexta.
    ///
    /// No guessing by name. Two Jean Tremblay are two people, and filing one man's car on the
    /// other man's record is a mistake nobody would ever think to look for.
    /// </summary>
    private async Task<Client?> ClientForAssetAsync(
        FormTemplate form,
        FormSubmission submission,
        IReadOnlyDictionary<FormFieldTarget, string> targets,
        Guid? createdClientId,
        CancellationToken ct)
    {
        var clients = db.Clients.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.TenantId == form.TenantId);

        if ((createdClientId ?? submission.CreatedClientId) is { } knownId)
        {
            var created = await clients.FirstOrDefaultAsync(c => c.Id == knownId, ct);
            if (created is not null) return created;
        }

        if (targets.GetValueOrDefault(FormFieldTarget.Courriel) is { } email)
        {
            var matched = await clients
                .Where(c => c.Email != null && c.Email.ToLower() == email.ToLower())
                .OrderBy(c => c.Number)
                .FirstOrDefaultAsync(ct);

            if (matched is not null) return matched;
        }

        if (submission.SubmittedByUserId is { } userId)
        {
            var mine = await db.TenantMemberships.IgnoreQueryFilters().AsNoTracking()
                .Where(m => m.UserId == userId
                    && m.TenantId == form.TenantId
                    && m.Role == UserRole.Client
                    && m.ClientId != null)
                .Select(m => m.ClientId)
                .FirstOrDefaultAsync(ct);

            if (mine is { } clientId) return await clients.FirstOrDefaultAsync(c => c.Id == clientId, ct);
        }

        return null;
    }

    /// <summary>Trimmed to what the column holds. A refused save would cost the answers.</summary>
    private static string? Cap(string? value, int length)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var trimmed = value.Trim();
        return trimmed.Length > length ? trimmed[..length] : trimmed;
    }

    /// <summary>
    /// A model year, or null when what was typed is not one.
    ///
    /// Bounded rather than merely parsed. "18" is a trim level and "200000" is a kilometre
    /// reading in the wrong box, and either of them stored as a year makes every list that
    /// sorts by it nonsense.
    /// </summary>
    private static int? ParseYear(string? value) =>
        int.TryParse(value?.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var year)
            && year >= 1900 && year <= DateTime.UtcNow.Year + 2
            ? year
            : null;

    /// <summary>
    /// A usage figure. Read the way it was typed: a Québec answer has a comma for a decimal mark
    /// and spaces inside the thousands, and both are what the keyboard produces.
    /// </summary>
    private static decimal? ParseDecimal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        // The same cleaning the validator applied before it said yes, and taken from it rather
        // than written again: anything a form accepted has to be readable here, or the figure
        // lands nowhere and nobody is told.
        return decimal.TryParse(
                FormAnswerRules.Numeric(value.Trim()),
                NumberStyles.Number,
                CultureInfo.InvariantCulture,
                out var parsed)
            && parsed >= 0
            ? parsed
            : null;
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
