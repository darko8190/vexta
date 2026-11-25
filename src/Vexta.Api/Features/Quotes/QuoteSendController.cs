using System.IO.Compression;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Quotes;

public record QuoteSentDto(string Email, DateTimeOffset SentAt, QuoteStatus Status);

/// <summary>
/// The quote as an email. The PDF itself is served by <see cref="QuotesController"/>, where the
/// customer can reach it too.
///
/// The send endpoints answer in the invoice's own shapes — the same recipients, the same copy to
/// employees, the same attachments — so the one send form serves both documents. The quote's
/// documents stand where an invoice offers its project's.
/// </summary>
[ApiController]
[Route("api/soumissions/{id:guid}")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
[RequireActiveSubscription]
public class QuoteSendController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IInvoicePdfService pdf,
    IMailgunService mailgun,
    IR2StorageService storage,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration) : ControllerBase
{
    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    /// <summary>Under Mailgun's own limit, so the answer can name the problem. Same as invoices.</summary>
    private const long MaxAttachmentBytes = 20L * 1024 * 1024;
    private const int MaxBodyLength = 100_000;
    private const int MaxSubjectLength = 300;

    /// <summary>
    /// What the send form opens with: who it can go to (the billing contact first), who can be
    /// put in copy, a covering message already written with this quote's figures, and the
    /// quote's documents. Writes nothing.
    /// </summary>
    [HttpGet("send-defaults")]
    public async Task<ActionResult<InvoiceSendDefaultsDto>> SendDefaults(
        Guid id, [FromQuery] bool relance, CancellationToken ct)
    {
        var quote = await db.Quotes.AsNoTracking()
            .Include(q => q.Client)
            .Include(q => q.Lines)
            .FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return NotFound();

        var recipients = await QuoteMail.RecipientsAsync(db, quote, ct);

        var employees = await db.Employees.AsNoTracking()
            .Where(e => e.Email != "")
            .OrderBy(e => e.FirstName).ThenBy(e => e.LastName)
            .Select(e => new InvoiceRecipientDto(e.Id, e.FirstName + " " + e.LastName, e.Email, e.JobTitle))
            .ToListAsync(ct);

        var documents = await db.QuoteDocuments.AsNoTracking()
            .Where(d => d.QuoteId == id)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new InvoiceAttachmentOptionDto(d.Id, d.Title, d.MediaAsset!.FileName, d.MediaAsset!.OriginalSizeBytes))
            .ToListAsync(ct);

        var company = await QuoteMail.CompanyNameAsync(db, currentUser.TenantId, ct);
        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == quote.TenantId, ct);
        var values = await QuoteMail.ValuesAsync(
            db, quote, settings, company, recipients.FirstOrDefault()?.Name ?? quote.Client?.Name ?? "", FrontendUrl, ct);

        // A reminder (relance) has its own wording; everything else about the message is the same.
        var subjectTemplate = relance
            ? QuoteEmailTemplate.ReminderSubject
            : Template(settings?.QuoteEmailSubject) ?? QuoteEmailTemplate.DefaultSubject;
        var bodyTemplate = relance
            ? QuoteEmailTemplate.ReminderBody
            : Template(settings?.QuoteEmailBody) ?? QuoteEmailTemplate.DefaultBody;

        var subject = QuoteEmailTemplate.Render(subjectTemplate, values, escapeHtml: false);
        var body = QuoteEmailTemplate.Render(bodyTemplate, values, escapeHtml: true);

        return Ok(new InvoiceSendDefaultsDto(
            recipients.FirstOrDefault()?.Email, subject, body, recipients, employees, documents));
    }

    /// <summary>
    /// Emails the quote with its PDF attached and marks it sent — only once Mailgun has accepted
    /// the message. A draft becomes Envoyée; an accepted or refused one keeps its status, because
    /// re-sending a copy changes nothing about the client's answer.
    /// </summary>
    [HttpPost("send")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<QuoteSentDto>> Send(Guid id, SendInvoiceRequest request, CancellationToken ct)
    {
        var quote = await db.Quotes.Include(q => q.Client).FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return NotFound();
        if (quote.Status == QuoteStatus.Remplacee)
            return BadRequest(new { message = "Cette version a été remplacée par une révision. Envoyez la révision." });

        var to = request.To?.Trim();
        if (string.IsNullOrWhiteSpace(to)) return BadRequest(new { message = "Indiquez l'adresse courriel du destinataire." });
        if (!IsEmailAddress(to)) return BadRequest(new { message = $"« {to} » n'est pas une adresse courriel valide." });

        var subject = request.Subject?.Trim() ?? string.Empty;
        if (subject.Length == 0) return BadRequest(new { message = "Le courriel a besoin d'un sujet." });
        if (subject.Length > MaxSubjectLength)
            return BadRequest(new { message = $"Le sujet dépasse {MaxSubjectLength} caractères." });

        var body = request.Body?.Trim() ?? string.Empty;
        if (body.Length == 0) return BadRequest(new { message = "Le courriel a besoin d'un message." });
        if (body.Length > MaxBodyLength) return BadRequest(new { message = "Le message est trop long. Mettez le reste en pièce jointe." });

        // Copies by employee id, read back from their records: accepting addresses as given would
        // make this an open relay from the company's own sending domain.
        var ccIds = request.CcEmployeeIds?.Distinct().ToList() ?? [];
        var cc = ccIds.Count == 0
            ? []
            : await db.Employees.AsNoTracking()
                .Where(e => ccIds.Contains(e.Id) && e.Email != "")
                .Select(e => e.Email)
                .ToListAsync(ct);

        var rendered = await pdf.RenderQuoteAsync(id, ct);
        if (rendered is not { } document) return NotFound();

        var attachments = new List<EmailAttachment>
        {
            new(QuoteMail.AttachmentName(quote), "application/pdf", document.Bytes)
        };

        var extras = await AttachmentSourcesAsync(id, request, ct);
        if (extras.Error is { } attachmentError) return BadRequest(new { message = attachmentError });

        long total = document.Bytes.Length;
        foreach (var file in extras.Files)
        {
            byte[] content;
            try
            {
                content = await ReadFromStorageAsync(file.ObjectKey, file.FileName, file.ContentEncoding, ct);
            }
            catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = $"Impossible de lire « {file.FileName} » dans le stockage de fichiers. {ex.Message}"
                });
            }

            total += content.Length;
            if (total > MaxAttachmentBytes)
            {
                return BadRequest(new
                {
                    message = $"Les pièces jointes dépassent {MaxAttachmentBytes / (1024 * 1024)} Mo, la limite de notre service d'envoi. Retirez-en."
                });
            }

            attachments.Add(new EmailAttachment(file.FileName, file.ContentType, content));
        }

        try
        {
            await mailgun.SendWithAttachmentsAsync(
                to,
                await QuoteMail.DisplayNameAsync(db, quote, to, ct),
                subject,
                body,
                cc,
                attachments,
                ct,
                // From the company that gives the price, read from the tenant: a super admin
                // inside a company sends on its behalf.
                await QuoteMail.CompanyNameAsync(db, currentUser.TenantId, ct));
        }
        catch (InvalidOperationException ex)
        {
            // Nothing was delivered, so the quote stays as it was.
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }

        quote.SentAt = DateTimeOffset.UtcNow;
        quote.SentTo = to;
        if (quote.Status == QuoteStatus.Brouillon) quote.Status = QuoteStatus.Envoyee;
        // An expired quote sent again with a new date is out with the client again.
        if (quote.Status == QuoteStatus.Expiree && quote.ProjectId is null && quote.InvoiceId is null
            && quote.ValidUntil is { } until && until >= BusinessDay.Today)
            quote.Status = QuoteStatus.Envoyee;
        quote.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(new QuoteSentDto(to, quote.SentAt.Value, quote.Status));
    }

    // ---- Helpers ----

    private record StoredFile(string ObjectKey, string FileName, string ContentType, string? ContentEncoding);

    private static bool IsEmailAddress(string value) =>
        System.Net.Mail.MailAddress.TryCreate(value, out var parsed)
        && string.Equals(parsed.Address, value, StringComparison.OrdinalIgnoreCase)
        && parsed.Host.Contains('.');

    private static string? Template(string? stored) =>
        string.IsNullOrWhiteSpace(stored) ? null : stored;

    /// <summary>
    /// Uploads from the form, and documents of this quote chosen by id — checked against the
    /// quote, so the form cannot attach another job's plans by guessing at ids.
    /// </summary>
    private async Task<(string? Error, List<StoredFile> Files)> AttachmentSourcesAsync(
        Guid quoteId, SendInvoiceRequest request, CancellationToken ct)
    {
        var files = new List<StoredFile>();

        var mediaIds = request.MediaAssetIds?.Distinct().ToList() ?? [];
        if (mediaIds.Count > 0)
        {
            var assets = await db.MediaAssets.AsNoTracking()
                .Where(a => mediaIds.Contains(a.Id))
                .Select(a => new StoredFile(a.ObjectKey, a.FileName, a.ContentType, a.ContentEncoding))
                .ToListAsync(ct);
            if (assets.Count != mediaIds.Count)
                return ("Une des pièces jointes est introuvable. Téléversez-la de nouveau.", files);
            files.AddRange(assets);
        }

        var documentIds = request.ProjectDocumentIds?.Distinct().ToList() ?? [];
        if (documentIds.Count == 0) return (null, files);

        var documents = await db.QuoteDocuments.AsNoTracking()
            .Where(d => documentIds.Contains(d.Id) && d.QuoteId == quoteId)
            .Select(d => new StoredFile(
                d.MediaAsset!.ObjectKey, d.MediaAsset!.FileName, d.MediaAsset!.ContentType, d.MediaAsset!.ContentEncoding))
            .ToListAsync(ct);
        if (documents.Count != documentIds.Count)
            return ("Un des documents choisis n'appartient pas à cette soumission.", files);

        files.AddRange(documents);
        return (null, files);
    }

    private async Task<byte[]> ReadFromStorageAsync(
        string objectKey, string fileName, string? contentEncoding, CancellationToken ct)
    {
        var url = await storage.CreateDownloadUrlAsync(objectKey, fileName, ct);
        using var client = httpClientFactory.CreateClient();
        using var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();
        var bytes = await response.Content.ReadAsByteArrayAsync(ct);

        // Inflated only when both the recorded encoding and the gzip magic number agree.
        if (!string.Equals(contentEncoding, "gzip", StringComparison.OrdinalIgnoreCase)) return bytes;
        if (bytes is not [0x1f, 0x8b, ..]) return bytes;

        using var source = new MemoryStream(bytes);
        using var gzip = new GZipStream(source, CompressionMode.Decompress);
        using var inflated = new MemoryStream();
        await gzip.CopyToAsync(inflated, ct);
        return inflated.ToArray();
    }
}
