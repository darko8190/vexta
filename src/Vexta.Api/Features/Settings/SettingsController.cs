using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Settings;

[ApiController]
[Route("api/admin/settings")]
[Authorize(Roles = nameof(UserRole.SuperAdmin))]
public class SettingsController(
    IPlatformSettingsService settings,
    IR2StorageService r2) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PlatformSettingsDto>> Get()
    {
        var values = await settings.GetManyAsync(
        [
            PlatformSettingKeys.MailgunApiKey,
            PlatformSettingKeys.MailgunDomain,
            PlatformSettingKeys.MailgunFromEmail,
            PlatformSettingKeys.MailgunFromName,
            PlatformSettingKeys.MailgunRegion,
            PlatformSettingKeys.StripeSecretKey,
            PlatformSettingKeys.StripePublishableKey,
            PlatformSettingKeys.StripeWebhookSecret,
            PlatformSettingKeys.R2AccountId,
            PlatformSettingKeys.R2AccessKeyId,
            PlatformSettingKeys.R2SecretAccessKey,
            PlatformSettingKeys.R2Bucket,
            PlatformSettingKeys.R2PublicBaseUrl
        ]);


        bool HasValue(string key) => !string.IsNullOrWhiteSpace(values[key]);

        return Ok(new PlatformSettingsDto(
            MailgunConfigured: HasValue(PlatformSettingKeys.MailgunApiKey) && HasValue(PlatformSettingKeys.MailgunDomain),
            MailgunDomain: values[PlatformSettingKeys.MailgunDomain],
            MailgunFromEmail: values[PlatformSettingKeys.MailgunFromEmail],
            MailgunFromName: values[PlatformSettingKeys.MailgunFromName],
            MailgunRegion: values[PlatformSettingKeys.MailgunRegion] ?? "us",
            StripeConfigured: HasValue(PlatformSettingKeys.StripeSecretKey) && HasValue(PlatformSettingKeys.StripeWebhookSecret),
            StripePublishableKey: values[PlatformSettingKeys.StripePublishableKey],
            R2Configured: HasValue(PlatformSettingKeys.R2AccountId)
                && HasValue(PlatformSettingKeys.R2AccessKeyId)
                && HasValue(PlatformSettingKeys.R2SecretAccessKey)
                && HasValue(PlatformSettingKeys.R2Bucket),
            R2AccountId: values[PlatformSettingKeys.R2AccountId],
            R2Bucket: values[PlatformSettingKeys.R2Bucket],
            R2PublicBaseUrl: values[PlatformSettingKeys.R2PublicBaseUrl]));
    }

    [HttpPut]
    public async Task<IActionResult> Update(UpdatePlatformSettingsRequest request)
    {
        await settings.SetManyAsync(new Dictionary<string, string?>
        {
            [PlatformSettingKeys.MailgunApiKey] = request.MailgunApiKey,
            [PlatformSettingKeys.MailgunDomain] = request.MailgunDomain,
            [PlatformSettingKeys.MailgunFromEmail] = request.MailgunFromEmail,
            [PlatformSettingKeys.MailgunFromName] = request.MailgunFromName,
            [PlatformSettingKeys.MailgunRegion] = request.MailgunRegion,
            [PlatformSettingKeys.StripeSecretKey] = request.StripeSecretKey,
            [PlatformSettingKeys.StripePublishableKey] = request.StripePublishableKey,
            [PlatformSettingKeys.StripeWebhookSecret] = request.StripeWebhookSecret,
            [PlatformSettingKeys.R2AccountId] = request.R2AccountId,
            [PlatformSettingKeys.R2AccessKeyId] = request.R2AccessKeyId,
            [PlatformSettingKeys.R2SecretAccessKey] = request.R2SecretAccessKey,
            [PlatformSettingKeys.R2Bucket] = request.R2Bucket,
            [PlatformSettingKeys.R2PublicBaseUrl] = request.R2PublicBaseUrl
        });

        if (request.R2PublicBaseUrl is not null && request.R2PublicBaseUrl.Length == 0)
        {
            await settings.ClearAsync(PlatformSettingKeys.R2PublicBaseUrl);
        }

        return NoContent();
    }


    /// <summary>Proves the R2 credentials work before anyone relies on them to upload.</summary>
    [HttpPost("r2/test")]
    public async Task<IActionResult> TestR2(CancellationToken ct)
    {
        try
        {
            await r2.CheckConnectionAsync(ct);
            return Ok(new { message = "Connexion à R2 réussie." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
