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
        ("validite", "« Elle est valide jusqu'au … », ou rien si la soumission n'a pas de date limite."),
        ("devise", "La devise, par exemple CAD."),
        (AcceptField, "Comment l'accepter : un lien vers le portail si le client y a accès, sinon une invitation à répondre au courriel. Dans le message seulement.")
    ];

    public static readonly IReadOnlySet<string> RawHtmlFields = new HashSet<string> { AcceptField };

    public const string DefaultSubject = "Soumission {{numero}} — {{entreprise}}";

    /// <summary>
    /// What a company that has not written its own sends: the price, how long it holds and how
    /// to say yes — the three things the client needs before opening the attachment.
    /// </summary>
    public const string DefaultBody =
        """
        <p>Bonjour {{contact}},</p>
        <p>Vous trouverez ci-jointe notre soumission <strong>{{numero}}</strong> au montant de {{total}} {{devise}}, taxes incluses. {{validite}}</p>
        {{acceptation}}
        <p>Merci de votre confiance.</p>
        <p style="color:#666">{{entreprise}}</p>
        """;

    public static string Render(string template, IReadOnlyDictionary<string, string> values, bool escapeHtml) =>
        InvoiceEmailTemplate.Render(template, Fields, values, escapeHtml, RawHtmlFields);

    /// <summary>
    /// The <c>{{acceptation}}</c> paragraph. A customer who can sign in answers with one button,
    /// so the message offers it; one without access is not sent to a page that would only ask
    /// for a password. <paramref name="portalUrl"/> must be a URL Vexta built.
    /// </summary>
    public static string AcceptParagraph(string? portalUrl) =>
        portalUrl is null
            ? "<p>Pour l'accepter, il suffit de nous la retourner signée ou de répondre à ce courriel. " +
              "N'hésitez pas à nous écrire pour toute question.</p>"
            : "<p>Vous pouvez la consulter et l'accepter en ligne depuis votre portail : " +
              $"<a href=\"{System.Net.WebUtility.HtmlEncode(portalUrl)}\">voir la soumission</a>. " +
              "Vous pouvez aussi nous la retourner signée ou répondre à ce courriel.</p>";

    public static string Validity(string? date) =>
        date is null ? string.Empty : $"Elle est valide jusqu'au {date}.";
}
