using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Assistant;

/// <param name="HasApiKey">Whether a key is on file. The key itself never comes back.</param>
public record AiSettingsDto(
    string Provider,
    string Model,
    bool HasApiKey,
    bool IsEnabled,
    bool CanWrite,
    /// <summary>False when the plan does not include the assistant: the form then says so.</summary>
    bool FeatureIncluded,
    /// <summary>
    /// What the company pays per million tokens. Null until they fill it in — nothing is guessed
    /// on their behalf, because a list price we invented would read like a statement of account.
    /// </summary>
    decimal? InputPricePerMillion,
    decimal? OutputPricePerMillion);

/// <param name="ApiKey">Left blank to keep the key already on file.</param>
public record SaveAiSettingsRequest(
    string Provider,
    string Model,
    string? ApiKey,
    bool IsEnabled,
    bool CanWrite,
    decimal? InputPricePerMillion,
    decimal? OutputPricePerMillion);

public record AssistantMessageDto(string Role, string Text);

public record AskAssistantRequest(IReadOnlyList<AssistantMessageDto> Messages);

public record AssistantActionDto(string Method, string Path, int Status, string Summary);

public record AssistantReplyDto(string Text, IReadOnlyList<AssistantActionDto> Actions);

[ApiController]
[Route("api/assistant")]
public class AssistantController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IFeatureService features,
    ISecretProtector protector,
    IAssistantService assistant) : ControllerBase
{
    /// <summary>
    /// What the header needs to decide whether to draw the button, asked by everyone who works
    /// there. Reading whether an assistant exists is not the same as being allowed to set it up.
    /// </summary>
    [HttpGet("disponibilite")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<ActionResult<AssistantAvailability>> Availability(CancellationToken ct) =>
        Ok(await assistant.AvailabilityAsync(ct));

    [HttpGet("parametres")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<ActionResult<AiSettingsDto>> Settings(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return NotFound();

        var included = await features.IsEnabledAsync(FeatureKeys.Ai, ct);
        var settings = await db.TenantAiSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);

        return Ok(settings is null
            ? new AiSettingsDto(
                nameof(AiProvider.Anthropic), "claude-opus-5-5", false, false, false, included, null, null)
            : new AiSettingsDto(
                settings.Provider.ToString(),
                settings.Model,
                !string.IsNullOrWhiteSpace(settings.EncryptedApiKey),
                settings.IsEnabled,
                settings.CanWrite,
                included,
                settings.InputPricePerMillion,
                settings.OutputPricePerMillion));
    }

    [HttpPut("parametres")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<ActionResult<AiSettingsDto>> Save(SaveAiSettingsRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return NotFound();

        if (!Enum.TryParse<AiProvider>(request.Provider, ignoreCase: true, out var provider))
        {
            return BadRequest(new { message = "Fournisseur inconnu. Choisissez Claude ou ChatGPT." });
        }

        var model = request.Model?.Trim();
        if (string.IsNullOrWhiteSpace(model) || model.Length > 100)
        {
            return BadRequest(new { message = "Indiquez le modèle à utiliser." });
        }

        var settings = await db.TenantAiSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        if (settings is null)
        {
            settings = new TenantAiSettings { TenantId = tenantId, Model = model };
            db.TenantAiSettings.Add(settings);
        }

        if (request.InputPricePerMillion is < 0 || request.OutputPricePerMillion is < 0)
        {
            return BadRequest(new { message = "Un prix ne peut pas être négatif." });
        }

        settings.Provider = provider;
        settings.Model = model;
        settings.CanWrite = request.CanWrite;
        settings.InputPricePerMillion = request.InputPricePerMillion;
        settings.OutputPricePerMillion = request.OutputPricePerMillion;
        settings.UpdatedAt = DateTimeOffset.UtcNow;

        // Blank means "leave the key alone", so the form can show a masked field without ever
        // having been sent the secret it is masking.
        if (!string.IsNullOrWhiteSpace(request.ApiKey))
        {
            settings.EncryptedApiKey = protector.Protect(request.ApiKey.Trim());
        }

        // Turning it on without a key would put a button in the header that can only fail.
        settings.IsEnabled = request.IsEnabled && !string.IsNullOrWhiteSpace(settings.EncryptedApiKey);

        await db.SaveChangesAsync(ct);

        return Ok(new AiSettingsDto(
            settings.Provider.ToString(),
            settings.Model,
            !string.IsNullOrWhiteSpace(settings.EncryptedApiKey),
            settings.IsEnabled,
            settings.CanWrite,
            await features.IsEnabledAsync(FeatureKeys.Ai, ct),
            settings.InputPricePerMillion,
            settings.OutputPricePerMillion));
    }

    /// <summary>Forgets the key, which is the only way to take one back.</summary>
    [HttpDelete("parametres/cle")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> ForgetKey(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return NotFound();

        var settings = await db.TenantAiSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        if (settings is null) return NoContent();

        settings.EncryptedApiKey = null;
        settings.IsEnabled = false;
        settings.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    /// <summary>
    /// Tries the two links in the chain — Vexta calling itself, and the provider accepting the
    /// key — and says which one is broken. Costs a fraction of a cent on the company's own
    /// account, which is cheaper than finding out mid-question.
    /// </summary>
    [HttpPost("test")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<ActionResult<AssistantTestResult>> Test(CancellationToken ct) =>
        Ok(await assistant.TestAsync(ct));

    /// <summary>
    /// One turn of the conversation. The transcript travels with each request rather than being
    /// kept on the server: nothing anybody typed to the assistant is stored in Vexta, which is
    /// the simplest honest answer to "where does what I asked it go".
    /// </summary>
    [HttpPost("message")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<ActionResult<AssistantReplyDto>> Ask(AskAssistantRequest request, CancellationToken ct)
    {
        if (request.Messages is null || request.Messages.Count == 0)
        {
            return BadRequest(new { message = "Aucun message." });
        }

        // Enough for a working conversation, few enough that a window left open all afternoon
        // does not quietly become an expensive request. The browser trims too; this is the
        // ceiling that actually holds.
        var history = request.Messages
            .TakeLast(40)
            .Select(m => new AssistantMessage(m.Role, m.Text))
            .ToList();

        var reply = await assistant.AskAsync(history, ct);

        return Ok(new AssistantReplyDto(
            reply.Text,
            reply.Actions.Select(a => new AssistantActionDto(a.Method, a.Path, a.Status, a.Summary)).ToList()));
    }
}
