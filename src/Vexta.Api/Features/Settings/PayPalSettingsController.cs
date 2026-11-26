using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Settings;

public record PayPalStateDto(bool Included, bool Connected, string? ClientId, bool Sandbox);

public record ConnectPayPalRequest(string ClientId, string Secret, bool Sandbox);

/// <summary>
/// Connecting the company's own PayPal Business account: the client id and secret of a REST app
/// it creates on developer.paypal.com. Checked with PayPal before they are kept, and the secret
/// is stored encrypted and never shown again. Owner only, like the Stripe account.
/// </summary>
[ApiController]
[Route("api/paypal")]
[Authorize(Roles = Roles.Owner)]
public class PayPalSettingsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IFeatureService features,
    IPayPalService paypal,
    ISecretProtector protector) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PayPalStateDto>> State(CancellationToken ct)
    {
        var tenant = await TenantAsync(ct);
        if (tenant is null) return NotFound();
        return Ok(ToDto(tenant, await features.IsEnabledAsync(FeatureKeys.PayPal, ct)));
    }

    [HttpPut]
    public async Task<ActionResult<PayPalStateDto>> Connect(ConnectPayPalRequest request, CancellationToken ct)
    {
        if (!await features.IsEnabledAsync(FeatureKeys.PayPal, ct))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "PayPal ne fait pas partie de votre forfait." });
        }

        var tenant = await TenantAsync(ct);
        if (tenant is null) return NotFound();

        var clientId = request.ClientId?.Trim() ?? "";
        var secret = request.Secret?.Trim() ?? "";
        if (clientId.Length == 0 || secret.Length == 0)
        {
            return BadRequest(new { message = "L'identifiant client et le secret sont requis." });
        }
        if (clientId.Length > 200 || secret.Length > 200) return BadRequest(new { message = "Identifiants trop longs." });

        if (await paypal.VerifyAsync(clientId, secret, request.Sandbox, ct) is { } problem)
        {
            return BadRequest(new { message = problem });
        }

        tenant.PayPalClientId = clientId;
        tenant.PayPalSecretProtected = protector.Protect(secret);
        tenant.PayPalSandbox = request.Sandbox;
        await db.SaveChangesAsync(ct);
        return Ok(ToDto(tenant, true));
    }

    [HttpDelete]
    public async Task<ActionResult<PayPalStateDto>> Disconnect(CancellationToken ct)
    {
        var tenant = await TenantAsync(ct);
        if (tenant is null) return NotFound();
        tenant.PayPalClientId = null;
        tenant.PayPalSecretProtected = null;
        tenant.PayPalSandbox = false;
        await db.SaveChangesAsync(ct);
        return Ok(ToDto(tenant, await features.IsEnabledAsync(FeatureKeys.PayPal, ct)));
    }

    private Task<Tenant?> TenantAsync(CancellationToken ct) =>
        db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == currentUser.TenantId, ct);

    private static PayPalStateDto ToDto(Tenant tenant, bool included) =>
        new(included, tenant.PayPalSecretProtected is not null, tenant.PayPalClientId, tenant.PayPalSandbox);
}
