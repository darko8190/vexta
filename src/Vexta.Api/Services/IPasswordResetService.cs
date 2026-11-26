using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>Why a reset could not be applied, in words the person can act on.</summary>
public record PasswordResetOutcome(bool Succeeded, string? Error)
{
    public static readonly PasswordResetOutcome Ok = new(true, null);

    public static PasswordResetOutcome Failed(string error) => new(false, error);
}

public interface IPasswordResetService
{
    /// <summary>
    /// Sends a reset link to that address when an account holds it. Returns whether a message
    /// actually left, which the caller must <em>not</em> pass on to an anonymous visitor: the
    /// answer tells them whether the address has an account here.
    /// </summary>
    Task<bool> SendLinkAsync(string email, CancellationToken ct = default);

    /// <summary>The same link, for the signed-in person's own address.</summary>
    Task<bool> SendLinkToUserAsync(ApplicationUser user, CancellationToken ct = default);

    Task<PasswordResetOutcome> ResetAsync(string packedToken, string newPassword, CancellationToken ct = default);
}

public class PasswordResetService(
    UserManager<ApplicationUser> userManager,
    IMailgunService mailgun,
    IConfiguration configuration,
    ILogger<PasswordResetService> logger) : IPasswordResetService
{
    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    public async Task<bool> SendLinkAsync(string email, CancellationToken ct = default)
    {
        var user = await userManager.FindByEmailAsync(email.Trim());
        return user is not null && await SendLinkToUserAsync(user, ct);
    }

    public async Task<bool> SendLinkToUserAsync(ApplicationUser user, CancellationToken ct = default)
    {
        if (!await mailgun.IsConfiguredAsync(ct))
        {
            logger.LogWarning("Réinitialisation demandée pour {Email} alors que Mailgun n'est pas configuré.", user.Email);
            return false;
        }

        var url = $"{FrontendUrl}/reinitialiser/{Pack(user.Id, await userManager.GeneratePasswordResetTokenAsync(user))}";

        // No company name anywhere in this message, and the platform's own sender name. A reset
        // is between the person and Vexta: a mail that looked like it came from their employer
        // would be the shape of the phishing this flow is most likely to attract.
        var body = $"""
            <p>Bonjour {System.Net.WebUtility.HtmlEncode(user.FirstName)},</p>
            <p>Vous avez demandé à changer votre mot de passe Vexta. Choisissez-en un nouveau :</p>
            <p><a href="{url}">Choisir un nouveau mot de passe</a></p>
            <p>Ce lien n'est valide que {(int)ResetLifetime.TotalHours} heures et ne fonctionne qu'une fois.</p>
            <p style="color:#666">Si cette demande ne vient pas de vous, ignorez ce message :
            votre mot de passe actuel reste en place.</p>
            """;

        try
        {
            await mailgun.SendAsync(
                user.Email!, $"{user.FirstName} {user.LastName}".Trim(),
                "Réinitialisation de votre mot de passe Vexta", body, ct);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Envoi du lien de réinitialisation à {Email} impossible.", user.Email);
            return false;
        }
    }

    public async Task<PasswordResetOutcome> ResetAsync(
        string packedToken, string newPassword, CancellationToken ct = default)
    {
        if (!TryUnpack(packedToken, out var userId, out var token))
        {
            return PasswordResetOutcome.Failed(Expired);
        }

        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null) return PasswordResetOutcome.Failed(Expired);

        var result = await userManager.ResetPasswordAsync(user, token, newPassword);
        if (result.Succeeded)
        {
            // A reset is also how someone locked out gets back in, so the counter goes with it.
            // Leaving it would hand them a working password and a refused sign-in.
            await userManager.ResetAccessFailedCountAsync(user);

            // The link reached this inbox and was opened, which is all a confirmation proves.
            // Asking for a second one afterwards would be a click for nothing.
            if (!user.EmailConfirmed)
            {
                user.EmailConfirmed = true;
                await userManager.UpdateAsync(user);
            }

            return PasswordResetOutcome.Ok;
        }

        // Identity reports a stale token and a password that fails the rules the same way, as a
        // list of errors. They are separated because the person can fix only one of them here:
        // a weak password is retyped, an expired link has to be asked for again.
        var errors = result.Errors.ToList();
        if (errors.Any(e => e.Code == nameof(IdentityErrorDescriber.InvalidToken)))
        {
            return PasswordResetOutcome.Failed(Expired);
        }

        return PasswordResetOutcome.Failed(string.Join(" ", errors.Select(e => e.Description)));
    }

    /// <summary>
    /// Matches <c>DataProtectionTokenProviderOptions.TokenLifespan</c>, set where Identity is
    /// registered. Stated here too because it is the sentence in the email.
    /// </summary>
    public static readonly TimeSpan ResetLifetime = TimeSpan.FromHours(2);

    private const string Expired =
        "Ce lien n'est plus valide. Demandez-en un nouveau depuis la page de connexion.";

    /// <summary>
    /// The user's id and Identity's token as one opaque path segment.
    ///
    /// Identity's token is base64 with + / and =, which do not survive a URL untouched, and the
    /// id has to travel with it — the token proves nothing on its own. Packing both into one
    /// base64url blob keeps the link a single segment, the same shape as an invitation, and
    /// leaves no readable id in a URL that will sit in an inbox.
    /// </summary>
    internal static string Pack(Guid userId, string token) =>
        WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes($"{userId}|{token}"));

    internal static bool TryUnpack(string packed, out Guid userId, out string token)
    {
        userId = Guid.Empty;
        token = "";

        try
        {
            var decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(packed));
            var separator = decoded.IndexOf('|');
            if (separator <= 0) return false;

            if (!Guid.TryParse(decoded[..separator], out userId)) return false;

            token = decoded[(separator + 1)..];
            return token.Length > 0;
        }
        catch (FormatException)
        {
            // A hand-edited or truncated link. Not an error worth a stack trace: the caller
            // turns it into the same "ask for a new one" as an expired token.
            return false;
        }
    }
}
