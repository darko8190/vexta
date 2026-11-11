namespace Vexta.Api.Features.Settings;

public record PlatformSettingsDto(
    bool MailgunConfigured,
    string? MailgunDomain,
    string? MailgunFromEmail,
    string? MailgunFromName,
    string MailgunRegion,
    bool StripeConfigured,
    string? StripePublishableKey,
    string? StripeMonthlyPriceId);

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
    string? StripeMonthlyPriceId);
