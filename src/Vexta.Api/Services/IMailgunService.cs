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
    /// <summary>
    /// <paramref name="fromName"/> is the name the recipient sees beside the address. A company's
    /// own name goes there, so an invitation from Construction Tremblay arrives from Construction
    /// Tremblay and not from us — the address stays ours because the sending domain is ours, and
    /// Mailgun will not send as a domain it does not hold. Null falls back to the platform name.
    /// </summary>
    Task SendAsync(
        string toEmail,
        string toName,
        string subject,
        string htmlBody,
        CancellationToken ct = default,
        string? fromName = null);

    /// <summary>
    /// The same, with a file attached. An invoice email without the invoice in it is a message
    /// asking someone to go and find their invoice.
    /// </summary>
    Task SendWithAttachmentAsync(
        string toEmail,
        string toName,
        string subject,
        string htmlBody,
        string fileName,
        string contentType,
        byte[] content,
        CancellationToken ct = default,
        string? fromName = null);

    /// <summary>
    /// The full form: people in copy, and as many files as the message carries.
    ///
    /// Copy and attachments are separate parameters rather than something the caller folds into
    /// the body, because Mailgun has to see them as such — an address written into the HTML is
    /// read by nobody, and a file described in a sentence is a file that did not arrive.
    /// </summary>
    Task SendWithAttachmentsAsync(
        string toEmail,
        string toName,
        string subject,
        string htmlBody,
        IReadOnlyCollection<string> ccEmails,
        IReadOnlyCollection<EmailAttachment> attachments,
        CancellationToken ct = default,
        string? fromName = null);

    /// <summary>Sends a real message to prove the credentials and the sending domain work.</summary>
    Task SendTestAsync(string toEmail, CancellationToken ct = default);
}

/// <summary>
/// One attached file: the name the recipient will see it under, what it is, and its bytes
/// already in hand. Bytes rather than a stream because Mailgun is sent one multipart body and
/// the total size has to be known before any of it leaves.
/// </summary>
public record EmailAttachment(string FileName, string ContentType, byte[] Content);

public class MailgunService(IHttpClientFactory httpClientFactory, IPlatformSettingsService settings, ILogger<MailgunService> logger)
    : IMailgunService
{
    public async Task<bool> IsConfiguredAsync(CancellationToken ct = default)
    {
        var values = await settings.GetManyAsync(
            [PlatformSettingKeys.MailgunApiKey, PlatformSettingKeys.MailgunDomain, PlatformSettingKeys.MailgunFromEmail], ct);
        return values.Values.All(v => !string.IsNullOrWhiteSpace(v));
    }

    public Task SendAsync(
        string toEmail,
        string toName,
        string subject,
        string htmlBody,
        CancellationToken ct = default,
        string? fromName = null) =>
        PostAsync(toEmail, toName, subject, htmlBody, [], [], ct, fromName);

    public Task SendWithAttachmentAsync(
        string toEmail,
        string toName,
        string subject,
        string htmlBody,
        string fileName,
        string contentType,
        byte[] content,
        CancellationToken ct = default,
        string? fromName = null) =>
        PostAsync(
            toEmail, toName, subject, htmlBody,
            [], [new EmailAttachment(fileName, contentType, content)], ct, fromName);

    public Task SendWithAttachmentsAsync(
        string toEmail,
        string toName,
        string subject,
        string htmlBody,
        IReadOnlyCollection<string> ccEmails,
        IReadOnlyCollection<EmailAttachment> attachments,
        CancellationToken ct = default,
        string? fromName = null) =>
        PostAsync(toEmail, toName, subject, htmlBody, ccEmails, attachments, ct, fromName);

    private async Task PostAsync(
        string toEmail,
        string toName,
        string subject,
        string htmlBody,
        IReadOnlyCollection<string> ccEmails,
        IReadOnlyCollection<EmailAttachment> attachments,
        CancellationToken ct,
        string? senderName)
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
        // The caller's name wins when it gave one: the recipient should see who is writing to
        // them, not the platform they have never heard of. The configured name is the fallback
        // for everything the platform itself sends.
        var fromName = CleanSenderName(senderName)
            ?? CleanSenderName(values[PlatformSettingKeys.MailgunFromName])
            ?? "Vexta";
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
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
            "Basic", Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes($"api:{apiKey}")));

        var form = new MultipartFormDataContent
        {
            { new StringContent($"{fromName} <{fromEmail}>"), "from" },
            { new StringContent($"{toName} <{toEmail}>"), "to" },
            { new StringContent(subject), "subject" },
            { new StringContent(htmlBody), "html" }
        };

        // One field per address, which is how Mailgun reads a list. A single comma-joined string
        // works too, but an address that itself carries a comma would then split in two.
        foreach (var cc in ccEmails.Where(c => !string.IsNullOrWhiteSpace(c)))
        {
            form.Add(new StringContent(cc.Trim()), "cc");
        }

        foreach (var file in attachments)
        {
            var part = new ByteArrayContent(file.Content);
            part.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(file.ContentType);
            // Repeated under the same name, again because that is how Mailgun reads several.
            form.Add(part, "attachment", file.FileName);
        }

        // The full URL, not BaseAddress plus a relative path. Relative resolution replaces the
        // last segment of the base path, so a base of ".../v3" and a relative "domain/messages"
        // resolve to ".../domain/messages" — the version segment is dropped and Mailgun answers
        // 404, which reads exactly like an unknown sending domain. Nothing caught it before
        // because this method used to log its failures and return.
        var response = await client.PostAsync($"{baseUrl}/{domain}/messages", form, ct);
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
    /// A display name fit to go in a From header, or null when there is nothing usable left.
    ///
    /// Tenant names are typed by people, so a quote, an angle bracket or a line break could end
    /// the name early and let whatever follows be read as another header. Stripped rather than
    /// escaped: a company called O'Brien keeps its apostrophe, and nobody's real name needs the
    /// characters this removes.
    /// </summary>
    private static string? CleanSenderName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;

        var cleaned = new string(name.Where(c => !char.IsControl(c) && c != '"' && c != '<' && c != '>').ToArray()).Trim();
        return cleaned.Length == 0 ? null : cleaned;
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
            // The body matters here. Mailgun's own "domain not found" comes back as JSON naming
            // the domain; a bare "404 page not found" is its router saying the path was wrong,
            // which is a bug on our side and not something the super admin can fix in a field.
            System.Net.HttpStatusCode.NotFound =>
                "Mailgun ne trouve pas ce domaine d'envoi. Soit il est mal écrit, soit il est dans "
                + $"l'autre région (us / eu), soit il appartient à un autre compte que celui de la clé d'API.{detail}",
            System.Net.HttpStatusCode.BadRequest =>
                $"Mailgun a refusé le message. Vérifiez l'adresse d'expédition et celle du destinataire.{detail}",
            _ => $"Mailgun a répondu {(int)status}.{detail}"
        };
    }
}
