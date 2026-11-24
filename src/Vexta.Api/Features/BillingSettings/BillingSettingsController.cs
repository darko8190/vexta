using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Auth;
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
    /// <summary>
    /// What the company bills in, as a three-letter code. Asked once here rather than on every
    /// invoice: a company bills in one currency, and each invoice keeps the answer that was in
    /// force when it was issued.
    /// </summary>
    string Currency,
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
    string NextInvoiceLabel,
    /// <summary>
    /// The company's own email wording, exactly as stored — null when it has written none.
    ///
    /// Not collapsed to the built-in text here: the screen has to show an empty field for a
    /// company that never wrote one, and saving what it was shown would freeze today's default
    /// into the row forever.
    /// </summary>
    string? InvoiceEmailSubject,
    string? InvoiceEmailBody,
    /// <summary>The built-in wording, which is what "Reprendre le modèle par défaut" writes.</summary>
    string DefaultInvoiceEmailSubject,
    string DefaultInvoiceEmailBody,
    /// <summary>
    /// The fields a template may use. Sent from the renderer's own list rather than written
    /// into the screen, so the fields offered are the fields that get filled in.
    /// </summary>
    IReadOnlyList<InvoiceEmailFieldDto> InvoiceEmailFields,
    /// <summary>The same four for the message a quote leaves with.</summary>
    string? QuoteEmailSubject,
    string? QuoteEmailBody,
    string DefaultQuoteEmailSubject,
    string DefaultQuoteEmailBody,
    IReadOnlyList<InvoiceEmailFieldDto> QuoteEmailFields);

/// <summary>One field a template may drop in, and what it stands for.</summary>
public record InvoiceEmailFieldDto(string Field, string Description);

/// <summary>The subject and the message as they will leave, filled in with sample values.</summary>
public record InvoiceEmailPreviewDto(string Subject, string Body);

public record SaveBillingSettingsRequest(
    string? GstNumber,
    string? QstNumber,
    string? RbqNumber,
    decimal GstRate,
    decimal QstRate,
    /// <summary>Nullable so an older client that does not send it keeps the default.</summary>
    string? Currency,
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
    [Authorize(Roles = Roles.Owner)]
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
        settings.Currency = CurrencyCode(request.Currency);
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
    [Authorize(Roles = Roles.Owner)]
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
    /// The subject and the message an invoice is emailed with.
    ///
    /// Its own endpoint, like the pricing one above and for the same reason: writing an email
    /// template is not the company declaring its taxes and its numbering, so this deliberately
    /// leaves <c>ConfiguredAt</c> alone and cannot unlock invoicing.
    ///
    /// Blank is stored as null, which the sender reads as "use the built-in wording" — a
    /// company that clears the field gets the default back rather than an empty email.
    /// </summary>
    [HttpPut("email")]
    [Authorize(Roles = Roles.Owner)]
    public Task<ActionResult<BillingSettingsDto>> SaveInvoiceEmail(
        SaveInvoiceEmailRequest request, CancellationToken ct) =>
        SaveEmailAsync(request, (settings, subject, body) =>
        {
            settings.InvoiceEmailSubject = subject;
            settings.InvoiceEmailBody = body;
        }, ct);

    /// <summary>The quote's wording, saved the same way and under the same limits.</summary>
    [HttpPut("email/soumission")]
    [Authorize(Roles = Roles.Owner)]
    public Task<ActionResult<BillingSettingsDto>> SaveQuoteEmail(
        SaveInvoiceEmailRequest request, CancellationToken ct) =>
        SaveEmailAsync(request, (settings, subject, body) =>
        {
            settings.QuoteEmailSubject = subject;
            settings.QuoteEmailBody = body;
        }, ct);

    private async Task<ActionResult<BillingSettingsDto>> SaveEmailAsync(
        SaveInvoiceEmailRequest request,
        Action<Domain.BillingSettings, string?, string?> apply,
        CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var subject = Clean(request.Subject);
        var body = Clean(request.Body);

        // The same ceilings the columns have: a message refused by the database after a long
        // write is a message lost, so it is refused here with something readable instead.
        if (subject is { Length: > 300 })
            return BadRequest(new { message = "Le sujet ne peut pas dépasser 300 caractères." });
        if (body is { Length: > 8000 })
            return BadRequest(new { message = "Le message ne peut pas dépasser 8 000 caractères." });

        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
        if (settings is null)
        {
            settings = new Domain.BillingSettings
            {
                TenantId = tenantId,
                // Until this row exists the flag on the policies answers for the default, so a
                // row born here has to carry that answer over. Otherwise a company that writes
                // its email wording before anything else would be told it has no default policy.
                DefaultPricePolicyId = await DefaultPolicyIdAsync(null, ct)
            };
            db.BillingSettings.Add(settings);
        }

        apply(settings, subject, body);
        settings.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(ToDto(settings, settings.DefaultPricePolicyId));
    }

    /// <summary>
    /// The subject and the message as they will arrive, filled in with sample values.
    ///
    /// The template comes in the request rather than being read back from the row, so the card
    /// previews what is being typed without saving it first — nobody should have to commit an
    /// email template to find out what it looks like. Null falls back to the built-in wording,
    /// exactly as sending does.
    ///
    /// It renders through <see cref="InvoiceEmailTemplate.Render"/>, the same call the sender
    /// uses: a preview that renders its own way is a preview nobody can rely on.
    /// </summary>
    [HttpPost("email/preview")]
    [Authorize]
    public async Task<ActionResult<InvoiceEmailPreviewDto>> PreviewInvoiceEmail(
        PreviewInvoiceEmailRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);

        // The real company name, so the preview reads like the email a client will open rather
        // than like a form with a placeholder in it.
        var company = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "Votre entreprise";

        var values = SampleValues(settings, company);
        var subject = Clean(request.Subject) ?? InvoiceEmailTemplate.DefaultSubject;
        var body = Clean(request.Body) ?? InvoiceEmailTemplate.DefaultBody;

        return Ok(new InvoiceEmailPreviewDto(
            // The subject is plain text and must not arrive with &amp; in it; the body is HTML
            // and must, which is the one thing this flag decides.
            InvoiceEmailTemplate.Render(subject, values, escapeHtml: false),
            InvoiceEmailTemplate.Render(body, values, escapeHtml: true)));
    }

    /// <summary>
    /// The quote's template filled in with a sample quote, through the same renderer the send
    /// form uses. The sample client has portal access, so the preview shows the link.
    /// </summary>
    [HttpPost("email/soumission/preview")]
    [Authorize]
    public async Task<ActionResult<InvoiceEmailPreviewDto>> PreviewQuoteEmail(
        PreviewInvoiceEmailRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
        var company = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "Votre entreprise";

        var model = settings ?? new Domain.BillingSettings();
        var subtotal = 2_450.00m;
        var taxes = Math.Round(subtotal * model.GstRate / 100m, 2) + Math.Round(subtotal * model.QstRate / 100m, 2);
        var issued = BusinessDay.Today;
        var validUntil = issued.AddDays(30).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        var values = new Dictionary<string, string>
        {
            ["numero"] = "S-0042",
            ["entreprise"] = company,
            ["client"] = "Construction Lavoie & Fils",
            ["contact"] = "Marie Lavoie",
            ["description"] = "Réfection de la toiture",
            ["total"] = InvoiceEmailTemplate.Money(subtotal + taxes),
            ["sous_total"] = InvoiceEmailTemplate.Money(subtotal),
            ["taxes"] = InvoiceEmailTemplate.Money(taxes),
            ["date_emission"] = issued.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["date_validite"] = validUntil,
            ["validite"] = QuoteEmailTemplate.Validity(validUntil),
            ["devise"] = CurrencyCode(model.Currency),
            // "#" rather than a real address: the preview is clicked by the company, not the client.
            [QuoteEmailTemplate.AcceptField] = QuoteEmailTemplate.AcceptParagraph("#")
        };

        return Ok(new InvoiceEmailPreviewDto(
            QuoteEmailTemplate.Render(Clean(request.Subject) ?? QuoteEmailTemplate.DefaultSubject, values, escapeHtml: false),
            QuoteEmailTemplate.Render(Clean(request.Body) ?? QuoteEmailTemplate.DefaultBody, values, escapeHtml: true)));
    }

    /// <summary>
    /// The invoice the preview pretends to send: the company's own numbering, rates and payment
    /// terms applied to one realistic job, so the amounts and the due date add up the way a real
    /// one would. The client name carries an ampersand on purpose — it is what shows the body
    /// escapes the values it fills in.
    /// </summary>
    private static IReadOnlyDictionary<string, string> SampleValues(
        Domain.BillingSettings? settings, string company)
    {
        var model = settings ?? new Domain.BillingSettings();

        var subtotal = 2_450.00m;
        var gst = Math.Round(subtotal * model.GstRate / 100m, 2);
        var qst = Math.Round(subtotal * model.QstRate / 100m, 2);

        // The day the company is in, not the container's. An invoice dated tomorrow is a
        // document somebody has to explain. See Common.BusinessDay.
        var issued = BusinessDay.Today;
        var due = issued.AddDays(model.PaymentTermsDays);

        // Dates written the way the invoice itself prints them, so the email and the attachment
        // never quote the same due date two ways.
        return new Dictionary<string, string>
        {
            ["numero"] = InvoiceNumbering.Format(model.InvoicePrefix, 42),
            ["entreprise"] = company,
            ["client"] = "Construction Lavoie & Fils",
            ["contact"] = "Marie Lavoie",
            ["projet"] = "P-2026-014",
            ["total"] = InvoiceEmailTemplate.Money(subtotal + gst + qst),
            ["sous_total"] = InvoiceEmailTemplate.Money(subtotal),
            ["taxes"] = InvoiceEmailTemplate.Money(gst + qst),
            ["date_emission"] = issued.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["date_echeance"] = due.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["devise"] = CurrencyCode(model.Currency)
        };
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
        var currency = CurrencyCode(r.Currency);
        if (currency.Length != 3 || !currency.All(char.IsAsciiLetter))
            return "La devise s'écrit en trois lettres, comme CAD, USD ou EUR.";
        if (r.PaymentTermsDays is < 0 or > 365) return "Le délai de paiement doit être entre 0 et 365 jours.";
        if (r.DefaultHourlyRate is < 0) return "Le taux horaire ne peut pas être négatif.";
        if (r.DefaultHourlyRate is > 100_000m) return "Le taux horaire est trop élevé.";
        return null;
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// The three-letter code, upper-cased, and CAD when nothing was said. Normalised rather than
    /// stored as typed: this string is printed on every invoice and read by whoever reconciles
    /// it, and "cad", "Cad " and "CAD" must not become three answers in one database.
    /// </summary>
    private static string CurrencyCode(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "CAD" : value.Trim().ToUpperInvariant();

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
            CurrencyCode(model.Currency),
            model.InvoicePrefix,
            model.NextInvoiceNumber,
            model.PaymentTermsDays,
            model.Terms,
            model.FooterNote,
            model.DefaultHourlyRate,
            model.MarginMode,
            defaultPolicyId,
            InvoiceNumbering.Format(model.InvoicePrefix, model.NextInvoiceNumber),
            model.InvoiceEmailSubject,
            model.InvoiceEmailBody,
            InvoiceEmailTemplate.DefaultSubject,
            InvoiceEmailTemplate.DefaultBody,
            [.. InvoiceEmailTemplate.Fields.Select(f => new InvoiceEmailFieldDto(f.Field, f.Description))],
            model.QuoteEmailSubject,
            model.QuoteEmailBody,
            QuoteEmailTemplate.DefaultSubject,
            QuoteEmailTemplate.DefaultBody,
            [.. QuoteEmailTemplate.Fields.Select(f => new InvoiceEmailFieldDto(f.Field, f.Description))]);
    }
}

/// <summary>
/// What the Courriel card saves. Blank means null, and null means the built-in wording — never
/// a copy of it, so a company that has not written its own keeps following the default.
/// </summary>
public record SaveInvoiceEmailRequest(string? Subject, string? Body);

/// <summary>
/// The template to render a preview of. Taken from the request so the card can show what is
/// being typed before it is saved; a missing part falls back to the built-in wording.
/// </summary>
public record PreviewInvoiceEmailRequest(string? Subject, string? Body);

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
