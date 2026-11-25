using System.Net;

namespace Vexta.Api.Features.Forms;

/// <summary>
/// The message that carries a form's link to one person. Short: who is asking, the note the
/// sender typed if any, and the button. The form itself says the rest once it is open.
/// </summary>
public static class FormLinkEmail
{
    public static string Build(string companyName, string formTitle, string? message, string url)
    {
        var company = WebUtility.HtmlEncode(companyName);
        var title = WebUtility.HtmlEncode(formTitle);
        var href = WebUtility.HtmlEncode(url);

        // The sender's own words, line breaks kept. Encoded first, so whatever was typed is shown
        // as text and never read as markup.
        var note = string.IsNullOrWhiteSpace(message)
            ? ""
            : $"<p>{WebUtility.HtmlEncode(message.Trim()).Replace("\r\n", "\n").Replace("\n", "<br>")}</p>";

        return $"""
            <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">
              <p>Bonjour,</p>

              <p>{company} vous invite à remplir le formulaire « {title} ».</p>

              {note}

              <p>
                <a href="{href}"
                   style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
                  Remplir le formulaire
                </a>
              </p>

              <p style="color:#6b7280;font-size:13px">
                Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>
                <a href="{href}" style="color:#6b7280">{href}</a>
              </p>
            </div>
            """;
    }
}
