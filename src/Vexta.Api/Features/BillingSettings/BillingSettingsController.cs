using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.BillingSettings;

/// <summary>
/// Configured is false until the company has saved this once. The invoice endpoints refuse to
/// create anything until then — an invoice is a legal document, and guessing its tax rate or
/// its numbering on the company's behalf is not a favour.
/// </summary>
public record BillingSettingsDto(
    bool Configured,
    string? GstNumber,
    string? QstNumber,
    /// <summary>The RBQ licence, printed under the company's address. Empty when it has none.</summary>
    string? RbqNumber,
    decimal GstRate,
    decimal QstRate,
    string InvoicePrefix,
    int NextInvoiceNumber,
    int PaymentTermsDays,
    string? Terms,
    string? FooterNote,
    /// <summary>What an hour of labour is charged at by default. Null until the company says.</summary>
    decimal? DefaultHourlyRate,
    /// <summary>Which of the two margin conventions the company means by "la marge".</summary>
    MarginMode MarginMode,
    /// <summary>
    /// The policy a project or an invoice uses when it names none. Answered from the flag on
    /// the policies themselves until the company has saved these settings once, so the two
    /// never contradict each other in the one window where there is no row to hold the id.
    /// </summary>
    Guid? DefaultPricePolicyId,
    /// <summary>What the next invoice will be called, so the form can show it before saving.</summary>
    string NextInvoiceLabel);

public record SaveBillingSettingsRequest(
    string? GstNumber,
    string? QstNumber,
    string? RbqNumber,
    decimal GstRate,
    decimal QstRate,
    string InvoicePrefix,
    int NextInvoiceNumber,
    int PaymentTermsDays,
    string? Terms,
    string? FooterNote,
    decimal? DefaultHourlyRate,
    MarginMode MarginMode,
    Guid? DefaultPricePolicyId);

[ApiController]
[Route("api/billing-settings")]
[StaffOnly]
[RequireActiveSubscription]
public class BillingSettingsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>Readable by anyone on the team: the invoice form needs the rates and the terms.</summary>
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<BillingSettingsDto>> Get(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);

        return Ok(ToDto(settings, await DefaultPolicyIdAsync(settings, ct)));
    }

    [HttpPut]
    [Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.SuperAdmin)}")]
    public async Task<ActionResult<BillingSettingsDto>> Save(SaveBillingSettingsRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Validate(request) is { } error) return BadRequest(new { message = error });

        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
        if (settings is null)
        {
            settings = new Domain.BillingSettings { TenantId = tenantId };
            db.BillingSettings.Add(settings);
        }

        settings.GstNumber = Clean(request.GstNumber);
        settings.QstNumber = Clean(request.QstNumber);
        settings.RbqNumber = Clean(request.RbqNumber);
        settings.GstRate = request.GstRate;
        settings.QstRate = request.QstRate;
        settings.InvoicePrefix = request.InvoicePrefix.Trim().ToUpperInvariant();
        settings.PaymentTermsDays = request.PaymentTermsDays;
        settings.Terms = Clean(request.Terms);
        settings.FooterNote = Clean(request.FooterNote);
        settings.DefaultHourlyRate = request.DefaultHourlyRate;
        settings.MarginMode = request.MarginMode;

        // Saving this card is the company stating its taxes and its numbering. Stamped once:
        // it is the gate on invoicing, not a timestamp of the last edit.
        settings.ConfiguredAt ??= DateTimeOffset.UtcNow;

        if (request.DefaultPricePolicyId is { } policyId
            && !await db.PricePolicies.AnyAsync(p => p.Id == policyId, ct))
        {
            return BadRequest(new { message = "Cette politique de prix n'existe pas." });
        }

        settings.DefaultPricePolicyId = request.DefaultPricePolicyId;
        await MirrorDefaultPolicyAsync(request.DefaultPricePolicyId, ct);

        // Never moved backwards onto a number already used: an invoice number is a reference
        // people quote, and two invoices sharing one is a problem nobody notices until an audit.
        var floor = await UsedCeilingAsync(tenantId, settings.InvoicePrefix, ct);
        settings.NextInvoiceNumber = Math.Max(request.NextInvoiceNumber, floor);

        settings.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(ToDto(settings, settings.DefaultPricePolicyId));
    }

    /// <summary>
    /// The hourly rate, the margin mode and the default policy — what the Taux and Marge cards
    /// save.
    ///
    /// Its own endpoint rather than the one above, because those cards must not answer for the
    /// company's taxes. It creates the settings row when there is none, and deliberately
    /// leaves <c>ConfiguredAt</c> alone: a company that has set an hourly rate has not thereby
    /// decided what tax it charges.
    /// </summary>
    [HttpPut("pricing")]
    [Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.SuperAdmin)}")]
    public async Task<ActionResult<BillingSettingsDto>> SavePricing(SavePricingRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        if (request.DefaultHourlyRate is < 0) return BadRequest(new { message = "Le taux horaire ne peut pas être négatif." });
        if (request.DefaultHourlyRate is > 100_000m) return BadRequest(new { message = "Le taux horaire est trop élevé." });

        if (request.DefaultPricePolicyId is { } policyId
            && !await db.PricePolicies.AnyAsync(p => p.Id == policyId, ct))
        {
            return BadRequest(new { message = "Cette politique de prix n'existe pas." });
        }

        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
        if (settings is null)
        {
            settings = new Domain.BillingSettings { TenantId = tenantId };
            db.BillingSettings.Add(settings);
        }

        settings.DefaultHourlyRate = request.DefaultHourlyRate;
        settings.MarginMode = request.MarginMode;
        settings.DefaultPricePolicyId = request.DefaultPricePolicyId;
        await MirrorDefaultPolicyAsync(request.DefaultPricePolicyId, ct);

        settings.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(ToDto(settings, settings.DefaultPricePolicyId));
    }

    /// <summary>
    /// The id saved here is the authority; the flag on each policy is what a list reads. This
    /// is what keeps a policy from showing as the default after another one took the place.
    /// </summary>
    private async Task MirrorDefaultPolicyAsync(Guid? defaultId, CancellationToken ct)
    {
        var policies = await db.PricePolicies.ToListAsync(ct);

        foreach (var policy in policies)
        {
            var now = defaultId is { } chosen && policy.Id == chosen;
            if (policy.IsDefault == now) continue;

            policy.IsDefault = now;
            policy.UpdatedAt = DateTimeOffset.UtcNow;
        }
    }

    /// <summary>
    /// Before the company has saved these settings once there is no row to hold the id, so the
    /// policy carrying the flag answers for it — otherwise reading the settings back would
    /// report no default and the next save would clear the one that exists.
    /// </summary>
    private async Task<Guid?> DefaultPolicyIdAsync(Domain.BillingSettings? settings, CancellationToken ct)
    {
        if (settings is not null) return settings.DefaultPricePolicyId;

        return await db.PricePolicies.AsNoTracking()
            .Where(p => p.IsDefault)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>One past the highest number already issued under this prefix.</summary>
    private async Task<int> UsedCeilingAsync(Guid tenantId, string prefix, CancellationToken ct)
    {
        var numbers = await db.Invoices.IgnoreQueryFilters()
            .Where(i => i.TenantId == tenantId && i.Number.StartsWith(prefix + "-"))
            .Select(i => i.Number)
            .ToListAsync(ct);

        var highest = numbers
            .Select(n => int.TryParse(n[(prefix.Length + 1)..], out var value) ? value : 0)
            .DefaultIfEmpty(0)
            .Max();

        return highest + 1;
    }

    private static string? Validate(SaveBillingSettingsRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.InvoicePrefix)) return "Le préfixe de numérotation est obligatoire.";
        if (r.InvoicePrefix.Trim().Length > 10) return "Le préfixe ne peut pas dépasser 10 caractères.";
        if (r.NextInvoiceNumber < 1) return "Le prochain numéro doit être au moins 1.";
        if (r.GstRate is < 0 or > 100 || r.QstRate is < 0 or > 100) return "Un taux de taxe doit être entre 0 et 100.";
        if (r.PaymentTermsDays is < 0 or > 365) return "Le délai de paiement doit être entre 0 et 365 jours.";
        if (r.DefaultHourlyRate is < 0) return "Le taux horaire ne peut pas être négatif.";
        if (r.DefaultHourlyRate is > 100_000m) return "Le taux horaire est trop élevé.";
        return null;
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// A missing row still answers with the defaults, so the form opens filled in rather than
    /// blank — but Configured stays false, which is what the invoice endpoints read.
    /// </summary>
    private static BillingSettingsDto ToDto(Domain.BillingSettings? settings, Guid? defaultPolicyId)
    {
        var model = settings ?? new Domain.BillingSettings();
        return new BillingSettingsDto(
            model.ConfiguredAt is not null,
            model.GstNumber,
            model.QstNumber,
            model.RbqNumber,
            model.GstRate,
            model.QstRate,
            model.InvoicePrefix,
            model.NextInvoiceNumber,
            model.PaymentTermsDays,
            model.Terms,
            model.FooterNote,
            model.DefaultHourlyRate,
            model.MarginMode,
            defaultPolicyId,
            InvoiceNumbering.Format(model.InvoicePrefix, model.NextInvoiceNumber));
    }
}

/// <summary>What the Taux and Marge cards save. Deliberately not the company's taxes.</summary>
public record SavePricingRequest(
    decimal? DefaultHourlyRate,
    MarginMode MarginMode,
    Guid? DefaultPricePolicyId);

/// <summary>Shared so the invoice that is created and the preview that is shown agree.</summary>
public static class InvoiceNumbering
{
    public static string Format(string prefix, int number) => $"{prefix}-{number:0000}";
}
