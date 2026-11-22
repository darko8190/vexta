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
    decimal GstRate,
    decimal QstRate,
    string InvoicePrefix,
    int NextInvoiceNumber,
    int PaymentTermsDays,
    string? Terms,
    string? FooterNote,
    /// <summary>What the next invoice will be called, so the form can show it before saving.</summary>
    string NextInvoiceLabel);

public record SaveBillingSettingsRequest(
    string? GstNumber,
    string? QstNumber,
    decimal GstRate,
    decimal QstRate,
    string InvoicePrefix,
    int NextInvoiceNumber,
    int PaymentTermsDays,
    string? Terms,
    string? FooterNote);

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

        return Ok(ToDto(settings));
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
        settings.GstRate = request.GstRate;
        settings.QstRate = request.QstRate;
        settings.InvoicePrefix = request.InvoicePrefix.Trim().ToUpperInvariant();
        settings.PaymentTermsDays = request.PaymentTermsDays;
        settings.Terms = Clean(request.Terms);
        settings.FooterNote = Clean(request.FooterNote);

        // Never moved backwards onto a number already used: an invoice number is a reference
        // people quote, and two invoices sharing one is a problem nobody notices until an audit.
        var floor = await UsedCeilingAsync(tenantId, settings.InvoicePrefix, ct);
        settings.NextInvoiceNumber = Math.Max(request.NextInvoiceNumber, floor);

        settings.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(ToDto(settings));
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
        return null;
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// A missing row still answers with the defaults, so the form opens filled in rather than
    /// blank — but Configured stays false, which is what the invoice endpoints read.
    /// </summary>
    private static BillingSettingsDto ToDto(Domain.BillingSettings? settings)
    {
        var model = settings ?? new Domain.BillingSettings();
        return new BillingSettingsDto(
            settings is not null,
            model.GstNumber,
            model.QstNumber,
            model.GstRate,
            model.QstRate,
            model.InvoicePrefix,
            model.NextInvoiceNumber,
            model.PaymentTermsDays,
            model.Terms,
            model.FooterNote,
            InvoiceNumbering.Format(model.InvoicePrefix, model.NextInvoiceNumber));
    }
}

/// <summary>Shared so the invoice that is created and the preview that is shown agree.</summary>
public static class InvoiceNumbering
{
    public static string Format(string prefix, int number) => $"{prefix}-{number:0000}";
}
