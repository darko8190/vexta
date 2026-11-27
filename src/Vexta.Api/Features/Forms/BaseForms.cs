using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Forms;

/// <summary>
/// The three forms every company starts with: a new customer account, an asset filed by its
/// owner, and a request for a quote.
///
/// Made once per company and then theirs. A tenant flag records that they were made, rather
/// than the forms being looked up by title on every visit: a company that deletes one has
/// decided it does not want it, and a form that comes back each time the list opens would be
/// the application overruling them.
///
/// Run on the way into the forms list, like the space switcher's own repair: one idempotent call
/// covers companies opened tomorrow and the ones that existed before this did, with no
/// migration writing rows into every tenant at once.
///
/// Published, so the crew can fill them from Outils straight away, but not on the public page:
/// what a company shows strangers is its own decision, one tick away.
/// </summary>
public static class BaseForms
{
    public static async Task EnsureAsync(VextaDbContext db, Guid tenantId, CancellationToken ct)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.Id == tenantId, ct);

        if (tenant is null || tenant.Kind != TenantKind.Business || tenant.BaseFormsCreatedAt is not null) return;

        var order = await db.FormTemplates.IgnoreQueryFilters()
            .Where(f => f.TenantId == tenantId)
            .MaxAsync(f => (int?)f.SortOrder, ct) ?? -1;

        foreach (var form in Build(tenantId))
        {
            form.SortOrder = ++order;
            db.FormTemplates.Add(form);
        }

        tenant.BaseFormsCreatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private static IEnumerable<FormTemplate> Build(Guid tenantId)
    {
        yield return Form(tenantId,
            "Création d'un compte client",
            "Vos coordonnées, pour ouvrir votre dossier chez nous.",
            FormKind.Client,
            requiresIdentification: false,
            successMessage: "Merci ! Votre dossier est ouvert, nous vous recontactons sous peu.",
            fields:
            [
                Field("Prénom", FormFieldType.Texte, true, FormFieldTarget.Prenom),
                Field("Nom", FormFieldType.Texte, true, FormFieldTarget.Nom),
                Field("Entreprise", FormFieldType.Texte, false, FormFieldTarget.NomEntreprise,
                    "Seulement si vous faites affaire au nom d'une entreprise."),
                Field("Courriel", FormFieldType.Courriel, true, FormFieldTarget.Courriel),
                Field("Téléphone", FormFieldType.Telephone, true, FormFieldTarget.Telephone),
                .. AddressFields(),
                Field("Comment nous avez-vous connus ?", FormFieldType.TexteLong, false, FormFieldTarget.Notes)
            ],
            actions: [new FormAction { TenantId = tenantId, Kind = FormActionKind.CreerClient, NewClientStatus = ClientStatus.Prospect }]);

        // Identified: the asset has to land on the file of the person filling it in, and the
        // only trustworthy way to know whose file that is, is their account.
        yield return Form(tenantId,
            "Création d'un actif",
            "Ajoutez à votre dossier ce sur quoi nous travaillons pour vous : un véhicule, un bâtiment, un appareil.",
            FormKind.Actif,
            requiresIdentification: true,
            successMessage: "C'est noté : l'actif est ajouté à votre dossier.",
            fields:
            [
                Field("Nom de l'actif", FormFieldType.Texte, true, FormFieldTarget.ActifLibelle,
                    "Comme vous l'appelez : « Camion de livraison », « Chalet du lac »."),
                Field("Marque", FormFieldType.Texte, false, FormFieldTarget.ActifMarque),
                Field("Modèle", FormFieldType.Texte, false, FormFieldTarget.ActifModele),
                Field("Année", FormFieldType.Nombre, false, FormFieldTarget.ActifAnnee),
                Field("Numéro de série", FormFieldType.Texte, false, FormFieldTarget.ActifNumeroSerie,
                    "Le NIV d'un véhicule, le numéro sur la plaque d'un appareil."),
                Field("Remarques", FormFieldType.TexteLong, false, FormFieldTarget.ActifNotes)
            ],
            actions: [new FormAction { TenantId = tenantId, Kind = FormActionKind.CreerActifClient }]);

        // Identified too, so the request arrives attached to a customer file rather than as an
        // address to call back. The answers land in Réponses, priced by the office.
        yield return Form(tenantId,
            "Demande de soumission",
            "Décrivez les travaux : nous vous revenons avec un prix.",
            FormKind.Soumission,
            requiresIdentification: true,
            successMessage: "Merci ! Nous étudions votre demande et vous revenons avec une soumission.",
            fields:
            [
                Field("Travaux à faire", FormFieldType.TexteLong, true, FormFieldTarget.Aucun,
                    "Ce qu'il faut faire, et ce qui vous a amené à nous écrire."),
                Field("Adresse des travaux", FormFieldType.Texte, false, FormFieldTarget.Aucun),
                Field("Date souhaitée", FormFieldType.Date, false, FormFieldTarget.Aucun),
                Field("Budget approximatif", FormFieldType.Nombre, false, FormFieldTarget.Aucun,
                    "En dollars, si vous en avez un en tête."),
                Field("Téléphone pour vous joindre", FormFieldType.Telephone, false, FormFieldTarget.Telephone)
            ],
            actions: []);
    }

    private static FormTemplate Form(
        Guid tenantId,
        string title,
        string description,
        FormKind kind,
        bool requiresIdentification,
        string successMessage,
        FormField[] fields,
        FormAction[] actions)
    {
        var form = new FormTemplate
        {
            TenantId = tenantId,
            Title = title,
            Description = description,
            Kind = kind,
            SuccessMessage = successMessage,
            IsPublished = true,
            ShowOnPublicPage = false,
            RequiresIdentification = requiresIdentification
        };

        for (var index = 0; index < fields.Length; index++)
        {
            fields[index].TenantId = tenantId;
            fields[index].FormTemplateId = form.Id;
            fields[index].SortOrder = index;
            form.Fields.Add(fields[index]);
        }

        for (var index = 0; index < actions.Length; index++)
        {
            actions[index].FormTemplateId = form.Id;
            actions[index].SortOrder = index;
            form.Actions.Add(actions[index]);
        }

        return form;
    }

    /// <summary>The Canadian provinces and territories, by the names the address sheets store.</summary>
    public static readonly string[] Provinces =
    [
        "Alberta", "Colombie-Britannique", "Île-du-Prince-Édouard", "Manitoba", "Nouveau-Brunswick",
        "Nouvelle-Écosse", "Nunavut", "Ontario", "Québec", "Saskatchewan", "Terre-Neuve-et-Labrador",
        "Territoires du Nord-Ouest", "Yukon"
    ];

    /// <summary>
    /// The address questions of the account form, each pointed at the client's address so the
    /// answers land in the client's list of addresses. Kept in step with the migration
    /// AddressOnClientAccountForm, which added the same questions to the forms made before.
    /// </summary>
    private static FormField[] AddressFields() =>
    [
        Field("Adresse", FormFieldType.Texte, true, FormFieldTarget.AdresseRue, "Le numéro et la rue."),
        Field("Appartement ou bureau", FormFieldType.Texte, false, FormFieldTarget.AdresseComplement),
        Field("Ville", FormFieldType.Texte, true, FormFieldTarget.AdresseVille),
        Field("Province", FormFieldType.Choix, true, FormFieldTarget.AdresseProvince, options: string.Join('\n', Provinces)),
        Field("Code postal", FormFieldType.Texte, true, FormFieldTarget.AdresseCodePostal)
    ];

    private static FormField Field(
        string label, FormFieldType type, bool required, FormFieldTarget target, string? help = null,
        string? options = null) => new()
    {
        Label = label,
        Type = type,
        IsRequired = required,
        Target = target,
        HelpText = help,
        Options = options
    };
}
