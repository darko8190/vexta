using Vexta.Api.Domain;

namespace Vexta.Api.Services;

public interface IMailgunService
{
    Task<bool> IsConfiguredAsync(CancellationToken ct = default);
    Task SendAsync(string toEmail, string toName, string subject, string htmlBody, CancellationToken ct = default);
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
            logger.LogWarning("Mailgun is not configured. Skipping email to {ToEmail}.", toEmail);
            return;
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
        }
    }
}
