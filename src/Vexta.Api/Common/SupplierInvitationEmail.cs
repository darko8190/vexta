using System.Net;

namespace Vexta.Api.Common;

/// <summary>
/// The message a company sends a supplier to tell them Vexta exists.
///
/// Deliberately short, and deliberately not a login link. There is nothing for a supplier to
/// sign into on their customer's space, so a message built like an invitation to an account
/// would promise access that does not exist and arrive looking like a phishing attempt.
///
/// It says who is writing, because that is the only reason it will be opened: the supplier knows
/// their customer and has never heard of us.
/// </summary>
public static class SupplierInvitationEmail
{
    public static string Build(string companyName, string supplierName, string frontendUrl, string? brandColor = null)
    {
        var company = WebUtility.HtmlEncode(companyName);
        var supplier = WebUtility.HtmlEncode(supplierName);
        var signupUrl = $"{frontendUrl.TrimEnd('/')}/inscription";

        return $"""
            <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">
              <p>Bonjour,</p>

              <p>
                {company} utilise <strong>Vexta</strong> pour ses clients, ses projets, ses achats
                et sa facturation, et nous y tenons la fiche de {supplier} comme fournisseur.
              </p>

              <p>
                Si {supplier} ouvre un compte, les entreprises qui vous ont déjà inscrit comme
                fournisseur apparaîtront directement dans vos clients — vous n'aurez pas à les
                saisir.
              </p>

              <p>
                <a href="{signupUrl}"
                   style="display:inline-block;background:{EmailButton.Colour(brandColor)};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
                  Voir Vexta
                </a>
              </p>

              <p style="color:#6b7280;font-size:13px">
                Ce message vous est envoyé à la demande de {company}. Si vous ne souhaitez pas
                donner suite, vous pouvez simplement l'ignorer.
              </p>
            </div>
            """;
    }
}
