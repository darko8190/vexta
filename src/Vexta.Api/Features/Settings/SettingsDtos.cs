namespace Vexta.Api.Features.Settings;

public record PlatformSettingsDto(
    bool MailgunConfigured,
    string? MailgunDomain,
    string? MailgunFromEmail,
    string? MailgunFromName,
    string MailgunRegion,
    bool StripeConfigured,
    string? StripePublishableKey,
    bool R2Configured,
    string? R2AccountId,
    string? R2Bucket,
    string? R2PublicBaseUrl,
    /// <summary>
    /// The one integration billed per use rather than per month. Reads the receipts
    /// photographed against an expense; how many a company gets is set on its plan.
    /// </summary>
    bool AnthropicConfigured);

// Secret fields left null/blank are not overwritten, so the UI can show masked fields without resending them.
public record UpdatePlatformSettingsRequest(
    string? MailgunApiKey,
    string? MailgunDomain,
    string? MailgunFromEmail,
    string? MailgunFromName,
    string? MailgunRegion,
    string? StripeSecretKey,
    string? StripePublishableKey,
    string? StripeWebhookSecret,
    string? R2AccountId,
    string? R2AccessKeyId,
    string? R2SecretAccessKey,
    string? R2Bucket,
    // An empty string clears the public base URL; null leaves it untouched. It is the one field
    // a deployment may legitimately want to empty, when moving to a private bucket.
    string? R2PublicBaseUrl,
    string? AnthropicApiKey = null);


/// <summary>
/// Blank means "send it to the address Mailgun is configured to send from", which is the one
/// address the super admin is certain to be able to check.
/// </summary>
public record SendTestEmailRequest(string? ToEmail);
