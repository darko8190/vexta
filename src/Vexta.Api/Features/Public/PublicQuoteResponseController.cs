using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Quotes;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Public;

/// <summary>The quote as the holder of its email link reads it: enough to answer, nothing more.</summary>
public record PublicQuoteDto(
    string CompanyName,
    string? CompanyBrandColor,
    string Label,
    string ClientName,
    string? Description,
    DateOnly? ValidUntil,
    decimal Subtotal,
    decimal Taxes,
    decimal Total,
    string Currency,
    QuoteStatus Status,
    /// <summary>Why it cannot be answered any more, or null while it waits for an answer.</summary>
    string? Closed,
    bool CanApprove,
    bool CanRequestChange,
    bool CanRefuse,
    DateTimeOffset? ChangeRequestedAt);

/// <param name="Name">Who answers. Required to approve: typing one's name is the signature.</param>
public record PublicQuoteAnswerRequest(string? Name, string? Note);

/// <summary>
/// Answering a quote from the email it arrived in, without an account: approve it, ask for a
/// change, or refuse it, as far as the company allows each. The token is the whole credential.
/// Approving does not make the project: the office converts the approved quote itself.
/// </summary>
[ApiController]
[Route("api/public/soumissions")]
[AllowAnonymous]
public class PublicQuoteResponseController(
    VextaDbContext db,
    IMailgunService mailgun,
    IConfiguration configuration,
    ILogger<PublicQuoteResponseController> logger) : ControllerBase
{
    private const int MaxNote = 2000;
    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    [HttpGet("{token}")]
    public async Task<ActionResult<PublicQuoteDto>> Get(string token, CancellationToken ct)
    {
        var found = await LoadAsync(token, ct);
        if (found is null) return NotFound();
        var (quote, settings, tenant) = found.Value;
        var totals = QuoteMail.Totals(quote, settings);
        return Ok(new PublicQuoteDto(
            tenant.Name, tenant.BrandColor, quote.Label, quote.Client?.Name ?? "", quote.Description, quote.ValidUntil,
            totals.Subtotal, totals.Taxes, totals.Subtotal + totals.Taxes, QuoteMail.Currency(settings?.Currency),
            quote.Status, Closed(quote),
            settings?.QuoteEmailCanApprove ?? true,
            settings?.QuoteEmailCanRequestChange ?? true,
            settings?.QuoteEmailCanRefuse ?? true,
            quote.ChangeRequestedAt));
    }

    [HttpPost("{token}/approuver")]
    public Task<IActionResult> Approve(string token, PublicQuoteAnswerRequest request, CancellationToken ct) =>
        AnswerAsync(token, request, "approuver", ct);

    [HttpPost("{token}/modifier")]
    public Task<IActionResult> RequestChange(string token, PublicQuoteAnswerRequest request, CancellationToken ct) =>
        AnswerAsync(token, request, "modifier", ct);

    [HttpPost("{token}/refuser")]
    public Task<IActionResult> Refuse(string token, PublicQuoteAnswerRequest request, CancellationToken ct) =>
        AnswerAsync(token, request, "refuser", ct);

    private async Task<IActionResult> AnswerAsync(string token, PublicQuoteAnswerRequest request, string answer, CancellationToken ct)
    {
        var found = await LoadAsync(token, ct, tracked: true);
        if (found is null) return NotFound();
        var (quote, settings, tenant) = found.Value;
        if (Closed(quote) is { } closed) return BadRequest(new { message = closed });

        var allowed = answer switch
        {
            "approuver" => settings?.QuoteEmailCanApprove ?? true,
            "modifier" => settings?.QuoteEmailCanRequestChange ?? true,
            _ => settings?.QuoteEmailCanRefuse ?? true
        };
        if (!allowed) return BadRequest(new { message = "Cette réponse ne se donne pas en ligne. Communiquez avec l'entreprise." });

        var name = Clean(request.Name);
        var note = Clean(request.Note);
        if (note is { Length: > MaxNote }) return BadRequest(new { message = $"Le message est limité à {MaxNote} caractères." });
        if (name is { Length: > 200 }) return BadRequest(new { message = "Le nom est limité à 200 caractères." });

        var now = DateTimeOffset.UtcNow;
        string verb;
        switch (answer)
        {
            case "approuver":
                if (name is not { Length: >= 2 }) return BadRequest(new { message = "Tapez votre nom complet pour approuver la soumission." });
                quote.Status = QuoteStatus.Acceptee;
                quote.ClientSignature = name;
                quote.ClientRespondedAt = now;
                quote.ClientRespondedBy = name;
                quote.ClientResponseNote = note;
                verb = "approuvé";
                break;
            case "modifier":
                if (note is null) return BadRequest(new { message = "Dites-nous ce que vous aimeriez changer." });
                quote.ChangeRequestedAt = now;
                quote.ChangeRequestNote = note;
                quote.ClientRespondedBy = name ?? quote.ClientRespondedBy;
                verb = "demandé une modification à";
                break;
            default:
                quote.Status = QuoteStatus.Refusee;
                quote.ClientRespondedAt = now;
                quote.ClientRespondedBy = name;
                quote.ClientResponseNote = note;
                verb = "refusé";
                break;
        }
        quote.UpdatedAt = now;
        await db.SaveChangesAsync(ct);

        await NotifyAsync(quote, tenant, verb, name, note, ct);
        return NoContent();
    }

    private static string? Closed(Quote quote)
    {
        if (quote.ProjectId is not null || quote.InvoiceId is not null || quote.Status == QuoteStatus.Acceptee)
            return "Cette soumission a déjà été approuvée. Merci!";
        if (quote.Status == QuoteStatus.Remplacee) return "Cette version a été remplacée par une soumission révisée.";
        if (quote.Status == QuoteStatus.Refusee) return "Cette soumission a été refusée.";
        if (quote.Status == QuoteStatus.Expiree || (quote.ValidUntil is { } until && until < BusinessDay.Today))
            return "Cette soumission est expirée. Communiquez avec l'entreprise pour un nouveau prix.";
        if (quote.Status != QuoteStatus.Envoyee) return "Cette soumission n'attend pas de réponse.";
        return null;
    }

    private async Task<(Quote Quote, Domain.BillingSettings? Settings, Tenant Tenant)?> LoadAsync(
        string token, CancellationToken ct, bool tracked = false)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 64) return null;
        var query = db.Quotes.IgnoreQueryFilters().Include(q => q.Lines).Include(q => q.Client)
            .Where(q => q.ResponseToken == token && q.DeletedAt == null);
        var quote = await (tracked ? query : query.AsNoTracking()).FirstOrDefaultAsync(ct);
        if (quote is null) return null;
        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(t => t.Id == quote.TenantId, ct);
        if (tenant is null) return null;
        var settings = await db.BillingSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == quote.TenantId, ct);
        return (quote, settings, tenant);
    }

    private async Task NotifyAsync(Quote quote, Tenant tenant, string verb, string? name, string? note, CancellationToken ct)
    {
        try
        {
            if (tenant.ContactEmail is not { Length: > 0 } to) return;
            var client = quote.Client?.Name ?? "Le client";
            var who = name is not null && name != client ? $" ({Html(name)})" : "";
            var body =
                $"<p>{Html(client)}{who} a {verb} la soumission {quote.Label} depuis le lien du courriel.</p>" +
                (note is null ? "" : $"<p>Son message :</p><blockquote>{Html(note).Replace("\n", "<br>")}</blockquote>") +
                (verb == "approuvé" ? "<p>Elle est prête à être convertie en projet.</p>" : "") +
                $"<p><a href=\"{FrontendUrl}/soumissions/{quote.Id}\">Ouvrir la soumission</a></p>";
            await mailgun.SendAsync(to, tenant.Name, $"Soumission {quote.Label} : {client} a répondu", body, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not tell tenant {TenantId} about the answer to quote {QuoteId}", quote.TenantId, quote.Id);
        }
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string Html(string value) => value
        .Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
}
