namespace Vexta.Api.Domain;

/// <summary>
/// What a form is for.
///
/// Not a behaviour switch: every kind accepts the same questions and runs the same actions. It
/// is what the form is <em>about</em>, which is what lets a company with fifteen of them find
/// the one it wants, and what lets the builder offer the matching action instead of making
/// somebody discover it. A garage ends up with one Actif form and four Défaut ones, and neither
/// had to be told the difference.
///
/// Stored as numbers, so new kinds are appended.
/// </summary>
public enum FormKind
{
    /// <summary>Questions, kept and e-mailed. What every form was before there was a choice.</summary>
    Defaut = 0,

    /// <summary>About something a client owns: a vehicle in for service, a building to inspect.</summary>
    Actif = 1,

    /// <summary>Brings somebody in: a contact form, a new-customer sheet.</summary>
    Client = 2,

    /// <summary>
    /// A request for a price. Vexta has no quote record yet, so the answers land in Réponses and
    /// the office prices them by hand — which is what a company does with the e-mail it gets
    /// today, minus the retyping. The kind is here so that work is already labelled when quotes
    /// arrive.
    /// </summary>
    Soumission = 3
}

/// <summary>
/// What a question accepts as an answer. The list is short on purpose: every type here is one
/// the company can explain to whoever fills the form, and a type nobody can explain is a field
/// that comes back empty.
///
/// Stored as numbers, so new types are appended.
/// </summary>
public enum FormFieldType
{
    Texte = 0,

    /// <summary>A paragraph. Same data as Texte — a different box, and that is the whole point.</summary>
    TexteLong = 1,

    Nombre = 2,
    Date = 3,

    /// <summary>One of the offered answers.</summary>
    Choix = 4,

    /// <summary>Any number of the offered answers, kept as the chosen labels joined by a comma.</summary>
    MultiChoix = 5,

    /// <summary>Oui or non. Its own type rather than a two-item Choix: a checkbox reads faster.</summary>
    OuiNon = 6,

    Courriel = 7,
    Telephone = 8,

    /// <summary>
    /// A file or an image, uploaded through the media routes like every other file in the
    /// application. The answer keeps the file's name as its text and points at the asset, so a
    /// submission still says what was attached after the file itself is deleted.
    /// </summary>
    Fichier = 9
}

/// <summary>
/// Which field of a new client an answer fills, when the form is set to create one.
///
/// Declared on the question rather than inside the action so the mapping survives reordering
/// the actions, and so the builder can say "cette réponse devient le courriel du client" right
/// where the question is being written.
/// </summary>
public enum FormFieldTarget
{
    Aucun = 0,

    // The client
    Prenom = 1,
    Nom = 2,
    NomEntreprise = 3,
    Courriel = 4,
    Telephone = 5,
    Notes = 6,

    // The client's asset. One target per column rather than a single "description" that gets
    // parsed: a year typed into a text box is a year nobody can filter on, and the whole point
    // of filing a vehicle is finding it again next spring by its plate.
    ActifLibelle = 7,
    ActifMarque = 8,
    ActifModele = 9,
    ActifAnnee = 10,
    ActifNumeroSerie = 11,
    ActifReference = 12,
    ActifUsage = 13,
    ActifNotes = 14
}

/// <summary>What happens once a form comes back.</summary>
public enum FormActionKind
{
    /// <summary>The answers, laid out, to one or more addresses.</summary>
    EnvoyerCourriel = 0,

    /// <summary>A client record, built from whichever questions were pointed at one.</summary>
    CreerClient = 1,

    /// <summary>
    /// An asset filed against a client: the car that was just dropped off, the building somebody
    /// asked to have inspected.
    ///
    /// Needs a client to hang it on, and finds one in whichever of three ways applies — the
    /// client this same submission just created, the client whose courriel came back in the
    /// answers, or the client whose own account filled the form. None of the three and nothing
    /// is created, said plainly in the log: an asset belonging to nobody is a row that will be
    /// found by nobody.
    /// </summary>
    CreerActifClient = 2
}

/// <summary>
/// A form the company built itself: the questions, and what a filled copy sets off.
///
/// Deliberately two halves. Most form tools stop at collecting answers, and then the answers
/// sit in a list nobody opens — the value is in what happens next, which is why
/// <see cref="Actions"/> is part of the form and not a feature bolted beside it.
/// </summary>
public class FormTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Title { get; set; }
    public string? Description { get; set; }

    /// <summary>What the form is about. See <see cref="FormKind"/>.</summary>
    public FormKind Kind { get; set; } = FormKind.Defaut;

    /// <summary>
    /// Said back to whoever just submitted it. Null falls back to a plain thank you — a form
    /// that answers with nothing leaves the person wondering whether it went.
    /// </summary>
    public string? SuccessMessage { get; set; }

    /// <summary>
    /// False while it is being written. A draft is not offered to be filled, which is what lets
    /// somebody build a twelve-question inspection sheet over two days without a crew filing
    /// half of it in the meantime.
    /// </summary>
    public bool IsPublished { get; set; }

    /// <summary>
    /// Offered to strangers on the company's page at /e/{slug}, as well as to the crew.
    ///
    /// Two switches rather than one, because they are two decisions. A safety checklist is
    /// published and must never be on the website; a quote request is both. And the public one
    /// alone does nothing: the page shows a form only when it is also published, so taking a
    /// form back to draft takes it off the website in the same gesture.
    ///
    /// A form with a Fichier question cannot be put on the page — a visitor with no account has
    /// nowhere to upload to — which is refused where it is set rather than silently skipped.
    /// </summary>
    public bool ShowOnPublicPage { get; set; }

    /// <summary>
    /// Whether a visitor must sign in before filling it on the public page.
    ///
    /// For the forms that file something on a customer's own record — an asset, a request for
    /// a quote. Without it the only clue to whose record is an email address typed into a box,
    /// and anybody can type anybody's. Signed in, the answers land on the file of the account
    /// that sent them, opened for them if they have none here yet.
    /// </summary>
    public bool RequiresIdentification { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<FormField> Fields { get; set; } = [];
    public List<FormAction> Actions { get; set; } = [];
    public List<FormSubmission> Submissions { get; set; } = [];
}

/// <summary>One question on a form.</summary>
public class FormField
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid FormTemplateId { get; set; }
    public FormTemplate? FormTemplate { get; set; }

    public required string Label { get; set; }

    /// <summary>The line under the question. Where "en kilomètres" or "le NIV au pare-brise" goes.</summary>
    public string? HelpText { get; set; }

    public FormFieldType Type { get; set; } = FormFieldType.Texte;

    public bool IsRequired { get; set; }

    /// <summary>
    /// The offered answers for a Choix or a MultiChoix, one per line. A single column rather
    /// than a table of its own: options are never queried, only read back with their question,
    /// and a table would buy nothing but a join.
    /// </summary>
    public string? Options { get; set; }

    public FormFieldTarget Target { get; set; } = FormFieldTarget.Aucun;

    public int SortOrder { get; set; }

    /// <summary>The offered answers as a list, in the order they were typed.</summary>
    public IReadOnlyList<string> OptionList() =>
        string.IsNullOrWhiteSpace(Options)
            ? []
            : Options.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

/// <summary>One thing a filled form sets off.</summary>
public class FormAction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid FormTemplateId { get; set; }
    public FormTemplate? FormTemplate { get; set; }

    public FormActionKind Kind { get; set; }

    /// <summary>
    /// Who the answers go to, for an EnvoyerCourriel. Several addresses separated by commas or
    /// semicolons, because that is how people type them.
    /// </summary>
    public string? Recipients { get; set; }

    /// <summary>The subject line. Null falls back to the form's own title.</summary>
    public string? Subject { get; set; }

    /// <summary>
    /// What the created client's status will be, for a CreerClient. Prospect by default: a form
    /// that brings in a name has brought in a lead, not yet a customer.
    /// </summary>
    public ClientStatus NewClientStatus { get; set; } = ClientStatus.Prospect;

    /// <summary>
    /// What kind of thing the created asset is, for a CreerActifClient: Véhicule, Immeuble,
    /// Machinerie. Chosen once on the action rather than asked of whoever fills the form — a
    /// « Fiche véhicule » creates a vehicle every time, and asking is one more way to be wrong.
    ///
    /// Nullable because a type is a convenience and not a condition, exactly as on the asset.
    /// </summary>
    public Guid? NewAssetTypeId { get; set; }
    public ClientAssetType? NewAssetType { get; set; }

    /// <summary>
    /// What the usage figure is counted in — « km », « heures », « cycles » — when a question
    /// fills it. Here and not on the question: the number means nothing without its unit, and
    /// the unit belongs to the shop rather than to the person answering.
    /// </summary>
    public string? NewAssetUsageUnit { get; set; }

    /// <summary>
    /// Turned off rather than deleted while something is being tried out, so the configuration
    /// that worked last month is still there to turn back on.
    /// </summary>
    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }
}

/// <summary>
/// One filled copy of a form, and what its actions managed to do.
///
/// The answers are snapshots (see <see cref="FormAnswer"/>): a form is edited over its life,
/// and a submission has to keep saying what was asked at the time it was answered.
/// </summary>
public class FormSubmission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid FormTemplateId { get; set; }
    public FormTemplate? FormTemplate { get; set; }

    /// <summary>Who filled it. Kept as an id and a name: the account may be gone by the time it is read.</summary>
    public Guid? SubmittedByUserId { get; set; }
    public string? SubmittedByName { get; set; }

    /// <summary>The client this submission created, when an action did. SetNull if it is deleted.</summary>
    public Guid? CreatedClientId { get; set; }
    public Client? CreatedClient { get; set; }

    /// <summary>The asset this submission filed, when an action did. SetNull if it is deleted.</summary>
    public Guid? CreatedClientAssetId { get; set; }
    public ClientAsset? CreatedClientAsset { get; set; }

    /// <summary>
    /// True when it came from a stranger on the company's public page rather than from the crew.
    ///
    /// Worth a column. The office reads these two kinds of reply differently — one was filled by
    /// somebody it employs and the other by somebody it has never met — and "Rempli par Jean
    /// Dubé" means something quite different in each case.
    /// </summary>
    public bool FromPublicPage { get; set; }

    /// <summary>
    /// What the actions did, in a sentence the office can read: "Courriel envoyé à
    /// bureau@acme.ca. Client C-0042 créé." Including the failures — an action that could not
    /// run has to be visible here, or the answers look filed when nothing happened.
    /// </summary>
    public string? ActionLog { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<FormAnswer> Answers { get; set; } = [];
}

/// <summary>
/// One answer, with the question it answered written beside it.
///
/// The label and the type are copies on purpose. Renaming a question next spring must not
/// rewrite what a crew answered last autumn, and deleting one must not take the answer with it.
/// </summary>
public class FormAnswer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid SubmissionId { get; set; }
    public FormSubmission? Submission { get; set; }

    /// <summary>The question, while it still exists. SetNull once it is deleted from the form.</summary>
    public Guid? FormFieldId { get; set; }
    public FormField? FormField { get; set; }

    public required string Label { get; set; }
    public FormFieldType Type { get; set; }

    /// <summary>
    /// The answer as text, whatever the type: a date as yyyy-MM-dd, a number as it was typed, a
    /// MultiChoix as its chosen labels joined by ", ". For a Fichier it is the file's name.
    /// One column because nothing computes on these -- they are read by people and e-mailed on.
    /// </summary>
    public string? Value { get; set; }

    /// <summary>
    /// The uploaded file, for a Fichier answer. SetNull when the file is deleted from the
    /// library: the answer still names what was sent, which is worth more than a row that
    /// vanishes and leaves a question looking unanswered.
    /// </summary>
    public Guid? MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }

    public int SortOrder { get; set; }
}
