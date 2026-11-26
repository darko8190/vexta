using Microsoft.AspNetCore.Identity;
using Vexta.Api.Domain;

namespace Vexta.Api.Services;

/// <summary>
/// Proves that the person signed in owns the address on their account.
///
/// Signing up does not check the address, and until now nothing needed it to. It matters as
/// soon as the address is used to find things: a company that typed a customer's e-mail on
/// their file has, in effect, addressed that customer's invoices to it. Showing them to whoever
/// signs up with that address — without proving they read its inbox — would hand anybody the
/// invoices of anybody whose e-mail they know.
/// </summary>
public interface IEmailConfirmationService
{
    /// <summary>Sends the link. False when no mail could leave (Mailgun off or failing).</summary>
    Task<bool> SendLinkAsync(ApplicationUser user, CancellationToken ct = default);

    /// <summary>Applies a link. Null when it worked, otherwise why not, in words.</summary>
    Task<string?> ConfirmAsync(string packedToken, CancellationToken ct = default);
}

public class EmailConfirmationService(
    UserManager<ApplicationUser> userManager,
    IMailgunService mailgun,
    IConfiguration configuration,
    ILogger<EmailConfirmationService> logger) : IEmailConfirmationService
{
    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    private const string Expired = "Ce lien n'est plus valide. Demandez-en un nouveau depuis « Mes factures ».";

    public async Task<bool> SendLinkAsync(ApplicationUser user, CancellationToken ct = default)
    {
        if (!await mailgun.IsConfiguredAsync(ct)) return false;

        var token = await userManager.GenerateEmailConfirmationTokenAsync(user);
        var url = $"{FrontendUrl}/confirmer-courriel/{PasswordResetService.Pack(user.Id, token)}";

        // The platform speaking, like the password reset, for the same reason: this mail is
        // about the person's account, not about any company they deal with.
        var body = $"""
            <p>Bonjour {System.Net.WebUtility.HtmlEncode(user.FirstName)},</p>
            <p>Confirmez que cette adresse est bien la vôtre. Les factures que des entreprises vous ont
            envoyées à cette adresse apparaîtront ensuite dans votre espace personnel.</p>
            <p><a href="{url}">Confirmer mon adresse</a></p>
            <p style="color:#666">Si cette demande ne vient pas de vous, ignorez ce message.</p>
            """;

        try
        {
            await mailgun.SendAsync(
                user.Email!, $"{user.FirstName} {user.LastName}".Trim(),
                "Confirmez votre adresse Vexta", body, ct);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Envoi du lien de confirmation à {Email} impossible.", user.Email);
            return false;
        }
    }

    public async Task<string?> ConfirmAsync(string packedToken, CancellationToken ct = default)
    {
        if (!PasswordResetService.TryUnpack(packedToken, out var userId, out var token)) return Expired;

        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null) return Expired;
        if (user.EmailConfirmed) return null;

        var result = await userManager.ConfirmEmailAsync(user, token);
        return result.Succeeded ? null : Expired;
    }
}
