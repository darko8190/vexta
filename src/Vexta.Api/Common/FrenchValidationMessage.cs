using System.Text.RegularExpressions;

namespace Vexta.Api.Common;

/// <summary>
/// Translates the model-binding messages ASP.NET writes itself.
///
/// These are reached when a request arrives without a field the contract requires, which in
/// normal use means a bug rather than a mistake by the person. They still land on their screen,
/// so they still have to be in French — an English sentence in the middle of the application
/// reads as a crash even when it is only a refusal.
///
/// Only the two sentences this API can actually produce are rewritten. Anything else is passed
/// through untouched: a message left in English is worse than a French one, but far better than
/// a wrong translation of something we did not anticipate.
/// </summary>
public static partial class FrenchValidationMessage
{
    public static string For(string message)
    {
        var required = RequiredField().Match(message);
        if (required.Success) return $"Le champ « {required.Groups[1].Value} » est obligatoire.";

        var invalid = InvalidValue().Match(message);
        if (invalid.Success) return $"La valeur du champ « {invalid.Groups[1].Value} » n'est pas valide.";

        return message;
    }

    [GeneratedRegex(@"^The (\w+) field is required\.$")]
    private static partial Regex RequiredField();

    [GeneratedRegex(@"is not valid for (\w+)\.$")]
    private static partial Regex InvalidValue();
}
