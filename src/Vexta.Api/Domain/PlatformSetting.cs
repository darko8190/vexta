namespace Vexta.Api.Domain;

// Super-admin-managed global settings (Mailgun, Stripe). Value is encrypted at rest.
public class PlatformSetting
{
    public required string Key { get; set; }
    public required string EncryptedValue { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public static class PlatformSettingKeys
{
    public const string MailgunApiKey = "Mailgun:ApiKey";
    public const string MailgunDomain = "Mailgun:Domain";
    public const string MailgunFromEmail = "Mailgun:FromEmail";
    public const string MailgunFromName = "Mailgun:FromName";
    public const string MailgunRegion = "Mailgun:Region"; // "us" or "eu"

    public const string StripeSecretKey = "Stripe:SecretKey";
    public const string StripePublishableKey = "Stripe:PublishableKey";
    public const string StripeWebhookSecret = "Stripe:WebhookSecret";
    public const string StripeMonthlyPriceId = "Stripe:MonthlyPriceId";
}
