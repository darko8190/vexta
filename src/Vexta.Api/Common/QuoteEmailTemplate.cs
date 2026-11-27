namespace Vexta.Api.Common;

/// <summary>
/// The message a quote is emailed with. The invoice's sibling: same braces, same renderer (see
/// <c>InvoiceEmailTemplate.Render</c>),
/// its own fields — a quote has a validity and an answer to ask for, not a due date.
/// </summary>
public static class QuoteEmailTemplate
{
    /// <summary>The field whose value is a paragraph of Vexta's own markup rather than data.</summary>
    public const string AcceptField = "acceptation";

    public static readonly IReadOnlyList<(string Field, string Description)> Fields =
    [
        ("numero", "Le numéro de la soumission, par exemple S-0042."),
        ("entreprise", "Le nom de votre entreprise."),
        ("client", "Le nom du client."),
        ("contact", "La personne à qui le courriel est adressé."),
        ("description", "La description de la soumission, ou vide si elle n'en a pas."),
        ("total", "Le total, taxes comprises."),
        ("sous_total", "Le total avant taxes."),
        ("taxes", "Le total des deux taxes."),
        ("date_emission", "La date de la soumission."),
        ("date_validite", "La date limite pour l'accepter, ou vide si elle n'en a pas."),
        ("validite", "« Elle est valide jusqu’au … », ou rien si la soumission n'a pas de date limite."),
        ("devise", "La devise, par exemple CAD."),
        (AcceptField, "Comment l'accepter : un lien vers le portail si le client y a accès, sinon une invitation à répondre au courriel. Dans le message seulement.")
    ];

    public static readonly IReadOnlySet<string> BodyOnlyFields = new HashSet<string> { AcceptField };

    public const string DefaultSubject = "Soumission {{numero}} — {{entreprise}}";

    /// <summary>
    /// What a company that has not written its own sends: the price, how long it holds and how
    /// to say yes — the three things the client needs before opening the attachment.
    /// </summary>
    public const string DefaultBody =
        """
        Bonjour {{contact}},

        Vous trouverez ci-jointe notre soumission {{numero}} au montant de {{total}} {{devise}}, taxes incluses. {{validite}}

        {{acceptation}}

        Merci de votre confiance.

        {{entreprise}}
        """;

    /// <summary>
    /// The reminder for a quote still waiting on an answer. Built in rather than a second
    /// template in the settings: it is read and edited in the send form every time, and it
    /// shares every field with the first message.
    /// </summary>
    public const string ReminderSubject = "Rappel : soumission {{numero}} — {{entreprise}}";

    public const string ReminderBody =
        """
        Bonjour {{contact}},

        Nous revenons vers vous au sujet de notre soumission {{numero}} au montant de {{total}} {{devise}}, taxes incluses, que vous trouverez de nouveau ci-jointe. {{validite}}

        {{acceptation}}

        Avez-vous des questions ou souhaitez-vous qu'on y apporte des changements ? Il nous fera plaisir d'en discuter.

        {{entreprise}}
        """;

    public static string Render(string template, IReadOnlyDictionary<string, string> values, bool isBody) =>
        InvoiceEmailTemplate.Render(template, Fields, values, isBody, BodyOnlyFields);

    /// <summary>
    /// The <c>{{acceptation}}</c> paragraph. A customer who can sign in answers with one button,
    /// so the message offers it; one without access is not sent to a page that would only ask
    /// for a password. <paramref name="portalUrl"/> must be a URL Vexta built.
    /// </summary>
    /// <summary>
    /// The answer links, one per answer the company allows, each on a line of its own. Falls
    /// back to the portal paragraph when the company allows none.
    /// </summary>
    public static string ResponseParagraph(string? responseUrl, bool approve, bool change, bool refuse, string? portalUrl)
    {
        if (responseUrl is null || !(approve || change || refuse)) return AcceptParagraph(portalUrl);
        var lines = new List<string> { "Vous pouvez nous répondre en un clic :" };
        if (approve) lines.Add($"Approuver la soumission :\n{responseUrl}?reponse=approuver");
        if (change) lines.Add($"Demander une modification :\n{responseUrl}?reponse=modifier");
        if (refuse) lines.Add($"Refuser la soumission :\n{responseUrl}?reponse=refuser");
        lines.Add("Vous pouvez aussi répondre à ce courriel pour toute question.");
        return string.Join("\n", lines);
    }

    public static string AcceptParagraph(string? portalUrl) =>
        portalUrl is null
            ? "Pour l'accepter, il suffit de nous la retourner signée ou de répondre à ce courriel. " +
              "N'hésitez pas à nous écrire pour toute question."
            // The address on a line of its own, so nothing after it is mistaken for part of it.
            : "Vous pouvez la consulter et l'accepter en ligne depuis votre portail :\n" +
              $"{portalUrl}\n" +
              "Vous pouvez aussi nous la retourner signée ou répondre à ce courriel.";

    /// <summary>
    /// The typographic apostrophe on purpose: the body escapes what it fills in, and a straight
    /// one would arrive in the editable message as &amp;#39;.
    /// </summary>
    public static string Validity(string? date) =>
        date is null ? string.Empty : $"Elle est valide jusqu’au {date}.";
}
