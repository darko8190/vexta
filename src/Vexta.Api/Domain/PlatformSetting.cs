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
    // The Stripe product every plan's price hangs off. Created once, then reused.
    public const string StripeProductId = "Stripe:ProductId";

    /// <summary>
    /// The signing secret of the Connect endpoint, which is a different endpoint at Stripe with
    /// a different secret from <see cref="StripeWebhookSecret"/>.
    ///
    /// Two secrets rather than one because Stripe signs the two streams separately: account
    /// events about connected companies arrive at the Connect endpoint, Vexta's own subscription
    /// events at the account endpoint. Verifying one with the other's secret fails the signature
    /// on every single delivery, and the failure reads exactly like an attack.
    /// </summary>
    public const string StripeConnectWebhookSecret = "Stripe:ConnectWebhookSecret";

    // Cloudflare R2: one bucket for the whole platform, each tenant under its own key prefix.
    public const string R2AccountId = "R2:AccountId";
    public const string R2AccessKeyId = "R2:AccessKeyId";
    public const string R2SecretAccessKey = "R2:SecretAccessKey";
    public const string R2Bucket = "R2:Bucket";
    public const string R2PublicBaseUrl = "R2:PublicBaseUrl";

    /// <summary>
    /// Reads the receipt photographed against an expense. The only key here that is billed per
    /// use rather than per month, which is why the plan carries an allowance and every scan is
    /// written down — see <see cref="ReceiptScan"/>.
    /// </summary>
    public const string AnthropicApiKey = "Anthropic:ApiKey";
}
