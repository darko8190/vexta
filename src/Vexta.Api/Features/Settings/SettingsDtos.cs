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
    string? R2PublicBaseUrl);

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
    string? R2PublicBaseUrl);

