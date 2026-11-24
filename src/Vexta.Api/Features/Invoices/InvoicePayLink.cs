using System.Security.Cryptography;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// The "payer en ligne" link an invoice carries.
///
/// One place, because three callers need the same answer: the email that goes out with it, the
/// button a company presses to copy the link, and the public page that reads the token back. A
/// second way of building the same URL would mean a link in an inbox that no longer resolves.
/// </summary>
public static class InvoicePayLink
{
    /// <summary>
    /// Gives the invoice a token if it has none and returns it. Does not save: the caller is
    /// already writing the invoice and the token belongs in the same transaction.
    ///
    /// Stored as it is sent, not hashed. Hashing is what <see cref="Services.InvitationToken"/>
    /// does and is right there — a leaked invitation table would hand out working accounts. Here
    /// it would protect nothing: everything the token reveals is the invoice sitting in the row
    /// next to it, and a hash would make the link impossible to put in a second reminder.
    /// </summary>
    public static string EnsureToken(Invoice invoice)
    {
        if (!string.IsNullOrWhiteSpace(invoice.PayToken)) return invoice.PayToken;

        // 32 bytes. The link is the whole credential, so it has to be beyond guessing rather
        // than merely untidy.
        invoice.PayToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

        return invoice.PayToken;
    }

    /// <summary>Where that token is read: a page on Vexta, not on the company's own domain.</summary>
    public static string Url(string frontendBaseUrl, string token) =>
        $"{frontendBaseUrl.TrimEnd('/')}/facture/{Uri.EscapeDataString(token)}";
}
