using Vexta.Api.Domain;

namespace Vexta.Api.Services;

public interface IMailgunService
{
    Task<bool> IsConfiguredAsync(CancellationToken ct = default);

    /// <summary>
    /// Throws <see cref="InvalidOperationException"/> when Mailgun is unconfigured or rejects the
    /// message. Silence would be worse: a caller that records "sent" on a refused message leaves
    /// someone waiting for an email that was never going to arrive.
    /// </summary>
    Task SendAsync(string toEmail, string toName, string subject, string htmlBody, CancellationToken ct = default);

    /// <summary>Sends a real message to prove the credentials and the sending domain work.</summary>
    Task SendTestAsync(string toEmail, CancellationToken ct = default);
}

public class MailgunService(IHttpClientFactory httpClientFactory, IPlatformSettingsService settings, ILogger<MailgunService> logger)
    : IMailgunService
{
    public async Task<bool> IsConfiguredAsync(CancellationToken ct = default)
    {
        var values = await settings.GetManyAsync(
            [PlatformSettingKeys.MailgunApiKey, PlatformSettingKeys.MailgunDomain, PlatformSettingKeys.MailgunFromEmail], ct);
        return values.Values.All(v => !string.IsNullOrWhiteSpace(v));
    }

    public async Task SendAsync(string toEmail, string toName, string subject, string htmlBody, CancellationToken ct = default)
    {
        var values = await settings.GetManyAsync(
        [
            PlatformSettingKeys.MailgunApiKey,
            PlatformSettingKeys.MailgunDomain,
            PlatformSettingKeys.MailgunFromEmail,
            PlatformSettingKeys.MailgunFromName,
            PlatformSettingKeys.MailgunRegion
        ], ct);

        var apiKey = values[PlatformSettingKeys.MailgunApiKey];
        var domain = values[PlatformSettingKeys.MailgunDomain];
        var fromEmail = values[PlatformSettingKeys.MailgunFromEmail];
        var fromName = values[PlatformSettingKeys.MailgunFromName] ?? "Vexta";
        var region = values[PlatformSettingKeys.MailgunRegion] ?? "us";

        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(domain) || string.IsNullOrWhiteSpace(fromEmail))
        {
            throw new InvalidOperationException(
                "Mailgun n'est pas configuré. Renseignez la clé d'API, le domaine et l'adresse d'expédition.");
        }

        var baseUrl = region.Equals("eu", StringComparison.OrdinalIgnoreCase)
            ? "https://api.eu.mailgun.net/v3"
            : "https://api.mailgun.net/v3";

        using var client = httpClientFactory.CreateClient();
        client.BaseAddress = new Uri(baseUrl);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Basic", Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes($"api:{apiKey}")));

        var form = new MultipartFormDataContent
        {
            { new StringContent($"{fromName} <{fromEmail}>"), "from" },
            { new StringContent($"{toName} <{toEmail}>"), "to" },
            { new StringContent(subject), "subject" },
            { new StringContent(htmlBody), "html" }
        };

        var response = await client.PostAsync($"{domain}/messages", form, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            logger.LogError("Mailgun send failed ({Status}): {Body}", response.StatusCode, body);
            throw new InvalidOperationException(Explain(response.StatusCode, body));
        }
    }

    public async Task SendTestAsync(string toEmail, CancellationToken ct = default)
    {
        var sentAt = DateTimeOffset.Now.ToString("d MMMM yyyy à HH:mm");
        var body = $"""
            <p>Ceci est un envoi de test depuis Vexta.</p>
            <p>Si vous lisez ce message, la clé d'API, le domaine d'envoi et l'adresse
            d'expédition sont corrects : les invitations et les factures partiront.</p>
            <p style="color:#666">Envoyé le {sentAt}.</p>
            """;

        await SendAsync(toEmail, "Test Vexta", "Test d'envoi Vexta", body, ct);
    }

    /// <summary>
    /// Mailgun answers in English and often with just a code. These are the refusals a first
    /// configuration actually hits, worded so the super admin knows which field to go fix.
    /// </summary>
    private static string Explain(System.Net.HttpStatusCode status, string body)
    {
        var detail = string.IsNullOrWhiteSpace(body) ? "" : $" ({body.Trim()})";
        return status switch
        {
            System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden =>
                "Mailgun a refusé la clé d'API. Vérifiez la clé et la région (US ou EU).",
            System.Net.HttpStatusCode.NotFound =>
                "Mailgun ne connaît pas ce domaine d'envoi. Vérifiez le domaine et la région.",
            System.Net.HttpStatusCode.BadRequest =>
                $"Mailgun a refusé le message. Vérifiez l'adresse d'expédition et celle du destinataire.{detail}",
            _ => $"Mailgun a répondu {(int)status}.{detail}"
        };
    }
}
