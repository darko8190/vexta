namespace Vexta.Api.Common;

/// <summary>
/// The message an invoice is emailed with: the company's own subject and text, and the fields
/// that get filled in from the invoice.
///
/// One place rather than two, because the settings screen has to preview exactly what the send
/// screen will produce. A preview that renders its own way is a preview nobody trusts, and the
/// first time the two disagree is in a client's inbox.
/// </summary>
public static class InvoiceEmailTemplate
{
    /// <summary>
    /// The fields a template may use, with what each one is for. Returned to the settings
    /// screen so the list of available fields is the list the renderer actually honours —
    /// documenting them anywhere else is how a documented field stops working.
    /// </summary>
    public static readonly IReadOnlyList<(string Field, string Description)> Fields =
    [
        ("numero", "Le numéro de la facture, par exemple F-0042."),
        ("entreprise", "Le nom de votre entreprise."),
        ("client", "Le nom du client facturé."),
        ("contact", "La personne à qui le courriel est adressé."),
        ("projet", "Le numéro du projet, ou vide si la facture n'en a pas."),
        ("total", "Le total à payer, taxes comprises."),
        ("sous_total", "Le total avant taxes."),
        ("taxes", "Le total des deux taxes."),
        ("date_emission", "La date d'émission."),
        ("date_echeance", "La date d'échéance."),
        ("devise", "La devise de la facture, par exemple CAD.")
    ];

    public const string DefaultSubject = "Facture {{numero}} — {{entreprise}}";

    /// <summary>
    /// The message used by a company that has not written its own. Deliberately plain: it says
    /// what is attached, what it comes to and when it is due, which is what the person opening
    /// it needs before they decide whether to read the attachment.
    /// </summary>
    public const string DefaultBody =
        """
        Bonjour,

        Vous trouverez ci-jointe la facture {{numero}} de {{entreprise}}, datée du {{date_emission}} et payable au plus tard le {{date_echeance}}.

        Montant à payer : {{total}} {{devise}}.

        Merci de votre confiance.

        {{entreprise}}
        """;

    /// <summary>
    /// Fills a template in, as plain text.
    ///
    /// Only the known fields are replaced, and anything else is left exactly as typed: a
    /// company that writes a brace in its signature must not watch the rest of its message
    /// disappear. Nothing is escaped here — the result is text, and <see cref="EmailText.ToHtml"/>
    /// escapes all of it at once when the mail leaves. A template saved in the old HTML form is
    /// read as text first.
    /// </summary>
    public static string Render(
        string template, IReadOnlyDictionary<string, string> values, bool isBody) =>
        Render(template, Fields, values, isBody, bodyOnlyFields: null);

    /// <summary>
    /// The same filling for any template: the quote's runs through here too, so the two never
    /// disagree about what a field is.
    ///
    /// <paramref name="bodyOnlyFields"/> names fields that are whole sentences meant for the
    /// message, and that a one-line subject leaves out.
    /// </summary>
    public static string Render(
        string template,
        IReadOnlyList<(string Field, string Description)> fields,
        IReadOnlyDictionary<string, string> values,
        bool isBody,
        IReadOnlySet<string>? bodyOnlyFields)
    {
        var rendered = isBody ? EmailText.ToPlain(template) : template;

        foreach (var (field, _) in fields)
        {
            var value = values.TryGetValue(field, out var found) ? found : string.Empty;
            if (!isBody && bodyOnlyFields?.Contains(field) == true) value = string.Empty;

            rendered = rendered.Replace($"{{{{{field}}}}}", value, StringComparison.Ordinal);
        }

        return rendered;
    }

    /// <summary>
    /// Money as the message should read it: "1 234,56 $" in French, without the currency code,
    /// which the template carries separately when it wants it.
    /// </summary>
    public static string Money(decimal amount) => amount.ToString("C2", Formats.Quebec);
}
