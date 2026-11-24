using System.Globalization;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Forms;

/// <summary>
/// What a form will accept as an answer.
///
/// Shared rather than private to the controller, because the same questions are now answered
/// from two places: by staff inside the application, and by a stranger applying for a job from
/// the company's public page. Two copies of these rules would mean a form that accepts an
/// answer from the street and refuses the same answer from the office.
/// </summary>
public static class FormAnswerRules
{
    /// <summary>
    /// Whether an answer can be accepted for its question. The message names the question, so
    /// somebody who scrolled past it knows which one to go back to.
    /// </summary>
    public static string? Problem(FormField field, string? value)
    {
        var answer = value?.Trim();

        if (string.IsNullOrWhiteSpace(answer))
        {
            return field.IsRequired ? $"« {field.Label} » est obligatoire." : null;
        }

        if (answer.Length > 4000) return $"La réponse à « {field.Label} » est trop longue.";

        switch (field.Type)
        {
            case FormFieldType.Nombre:
                // Read the way it is typed. A Québec keyboard gives 12,5 and a phone keypad
                // 12.5, and a kilometre reading is written 142 350 — refusing any of the three
                // would be refusing the right answer. The spaces go because they are a grouping
                // mark here and not a separator the invariant culture knows; the non-breaking
                // one goes too, because that is what a paste from a spreadsheet carries.
                if (!decimal.TryParse(Numeric(answer), NumberStyles.Number, CultureInfo.InvariantCulture, out _))
                {
                    return $"« {field.Label} » attend un nombre.";
                }
                break;

            case FormFieldType.Date:
                if (!DateOnly.TryParse(answer, CultureInfo.InvariantCulture, out _))
                {
                    return $"« {field.Label} » attend une date.";
                }
                break;

            case FormFieldType.Courriel:
                // Loose on purpose. A strict pattern refuses real addresses, and the only true
                // test of an address is sending something to it.
                if (!answer.Contains('@') || answer.StartsWith('@') || answer.EndsWith('@'))
                {
                    return $"« {field.Label} » attend une adresse courriel.";
                }
                break;

            case FormFieldType.Choix:
                if (!field.OptionList().Contains(answer, StringComparer.OrdinalIgnoreCase))
                {
                    return $"« {answer} » n'est pas un choix offert pour « {field.Label} ».";
                }
                break;

            case FormFieldType.MultiChoix:
                var offered = field.OptionList();
                var chosen = answer.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                var unknown = chosen.FirstOrDefault(c => !offered.Contains(c, StringComparer.OrdinalIgnoreCase));
                if (unknown is not null)
                {
                    return $"« {unknown} » n'est pas un choix offert pour « {field.Label} ».";
                }
                break;

            case FormFieldType.Fichier:
                // The text of a file answer is the file's name, which the caller does not
                // choose: the controller writes it from the asset it just verified. Nothing to
                // check here beyond the answer being present, which is handled above.
                break;

            case FormFieldType.OuiNon:
                if (!answer.Equals("Oui", StringComparison.OrdinalIgnoreCase)
                    && !answer.Equals("Non", StringComparison.OrdinalIgnoreCase))
                {
                    return $"« {field.Label} » attend oui ou non.";
                }
                break;
        }

        return null;
    }

    /// <summary>
    /// A typed figure as the invariant culture can read it. Kept beside the rule that uses it
    /// and mirrored by the form action runner, which has to be able to read everything this
    /// accepts — a validator that says yes to an answer the runner cannot parse is an answer
    /// that silently lands nowhere.
    /// </summary>
    public static string Numeric(string value) => value
        .Replace(" ", string.Empty)
        .Replace(" ", string.Empty)
        .Replace(" ", string.Empty)
        .Replace(',', '.');
}
