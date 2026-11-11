using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Settings;

[ApiController]
[Route("api/admin/settings")]
[Authorize(Roles = nameof(UserRole.SuperAdmin))]
public class SettingsController(IPlatformSettingsService settings) : ControllerBase
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
            PlatformSettingKeys.StripeMonthlyPriceId
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
            StripeMonthlyPriceId: values[PlatformSettingKeys.StripeMonthlyPriceId]));
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
            [PlatformSettingKeys.StripeMonthlyPriceId] = request.StripeMonthlyPriceId
        });

        return NoContent();
    }
}
