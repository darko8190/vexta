using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Projects;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Quotes;

/// <summary>
/// The files filed against a quote. The same shape as a project's documents, answered with the
/// same DTO, so the screen that shows one shows the other. Staff only, like the rest of the quote.
///
/// Not locked once the quote has become a project: its documents were carried over at that
/// moment, and filing one more here afterwards changes no price.
/// </summary>
[ApiController]
[Route("api/soumissions/{quoteId:guid}/documents")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
[RequireActiveSubscription]
public class QuoteDocumentsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IR2StorageService storage) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProjectDocumentDto>>> List(Guid quoteId, CancellationToken ct)
    {
        if (!await db.Quotes.AnyAsync(q => q.Id == quoteId, ct)) return NotFound();
        return Ok(await LoadAsync(quoteId, ct));
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectDocumentDto>> Create(
        Guid quoteId, SaveProjectDocumentRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.Quotes.AnyAsync(q => q.Id == quoteId, ct)) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        // The library is scoped to the company by its query filter: an id from elsewhere is
        // simply not found.
        if (!await db.MediaAssets.AnyAsync(m => m.Id == request.MediaAssetId, ct))
            return BadRequest(new { message = "Le fichier téléversé est introuvable." });

        var document = new QuoteDocument
        {
            TenantId = tenantId,
            QuoteId = quoteId,
            Title = request.Title.Trim(),
            Category = Clean(request.Category),
            MediaAssetId = request.MediaAssetId,
            UploadedById = currentUser.UserId,
        };

        db.QuoteDocuments.Add(document);
        await db.SaveChangesAsync(ct);
        return await OneAsync(quoteId, document.Id, ct);
    }

    /// <summary>The title and the filing only; a new file is a new document.</summary>
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProjectDocumentDto>> Update(
        Guid quoteId, Guid id, SaveProjectDocumentRequest request, CancellationToken ct)
    {
        var document = await db.QuoteDocuments.FirstOrDefaultAsync(d => d.Id == id && d.QuoteId == quoteId, ct);
        if (document is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        document.Title = request.Title.Trim();
        document.Category = Clean(request.Category);
        await db.SaveChangesAsync(ct);
        return await OneAsync(quoteId, id, ct);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid quoteId, Guid id, CancellationToken ct)
    {
        var document = await db.QuoteDocuments.FirstOrDefaultAsync(d => d.Id == id && d.QuoteId == quoteId, ct);
        if (document is null) return NotFound();

        // The row only; the file stays in the library, where it may be in use elsewhere.
        db.QuoteDocuments.Remove(document);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Problem(SaveProjectDocumentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title)) return "Le titre du document est obligatoire.";
        if (request.Title.Trim().Length > 200) return "Le titre du document est trop long.";
        if (request.Category is { Length: > 100 }) return "La catégorie est trop longue.";
        if (request.MediaAssetId == Guid.Empty) return "Téléversez un fichier.";
        return null;
    }

    private async Task<ActionResult<ProjectDocumentDto>> OneAsync(Guid quoteId, Guid id, CancellationToken ct)
    {
        var document = (await LoadAsync(quoteId, ct)).FirstOrDefault(d => d.Id == id);
        return document is null ? NotFound() : Ok(document);
    }

    /// <summary>With a freshly signed link each; null when storage cannot sign one.</summary>
    private async Task<List<ProjectDocumentDto>> LoadAsync(Guid quoteId, CancellationToken ct)
    {
        var rows = await db.QuoteDocuments.AsNoTracking()
            .Where(d => d.QuoteId == quoteId)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new
            {
                d.Id,
                d.Title,
                d.Category,
                d.MediaAssetId,
                d.MediaAsset!.FileName,
                d.MediaAsset!.ContentType,
                d.MediaAsset!.SizeBytes,
                d.MediaAsset!.ObjectKey,
                UploadedByName = db.Users.Where(u => u.Id == d.UploadedById)
                    .Select(u => u.FirstName + " " + u.LastName)
                    .FirstOrDefault(),
                d.CreatedAt,
            })
            .ToListAsync(ct);

        var documents = new List<ProjectDocumentDto>(rows.Count);
        foreach (var row in rows)
        {
            string? url = null;
            try
            {
                url = await storage.CreateDownloadUrlAsync(row.ObjectKey, row.FileName, ct);
            }
            catch (InvalidOperationException)
            {
                // Storage not configured: the list is still worth showing.
            }

            documents.Add(new ProjectDocumentDto(
                row.Id, row.Title, row.Category, row.MediaAssetId, row.FileName, row.ContentType,
                row.SizeBytes, url, row.UploadedByName, row.CreatedAt));
        }

        return documents;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>
/// The quote's internal thread of dated entries — what the client asked for at the visit, why
/// the price moved. Same rules as a project's notes: staff only, and an entry is changed by its
/// author or the owner of the account.
/// </summary>
[ApiController]
[Route("api/soumissions/{quoteId:guid}/notes")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
[RequireActiveSubscription]
public class QuoteNotesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    private const int MaxBodyLength = 4000;

    [HttpGet]
    public async Task<ActionResult<List<ProjectNoteDto>>> List(Guid quoteId, CancellationToken ct)
    {
        if (!await db.Quotes.AnyAsync(q => q.Id == quoteId, ct)) return NotFound();

        return Ok(await db.QuoteNotes.AsNoTracking()
            .Where(n => n.QuoteId == quoteId)
            .OrderByDescending(n => n.CreatedAt)
            .Select(ToDto())
            .ToListAsync(ct));
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectNoteDto>> Create(Guid quoteId, SaveProjectNoteRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.Quotes.AnyAsync(q => q.Id == quoteId, ct)) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var note = new QuoteNote
        {
            TenantId = tenantId,
            QuoteId = quoteId,
            Body = request.Body.Trim(),
            CreatedById = currentUser.UserId,
        };

        db.QuoteNotes.Add(note);
        await db.SaveChangesAsync(ct);
        return await OneAsync(note.Id, ct);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProjectNoteDto>> Update(
        Guid quoteId, Guid id, SaveProjectNoteRequest request, CancellationToken ct)
    {
        var note = await db.QuoteNotes.FirstOrDefaultAsync(n => n.Id == id && n.QuoteId == quoteId, ct);
        if (note is null) return NotFound();
        if (Forbidden(note) is { } refusal) return BadRequest(new { message = refusal });
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        note.Body = request.Body.Trim();
        note.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return await OneAsync(id, ct);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid quoteId, Guid id, CancellationToken ct)
    {
        var note = await db.QuoteNotes.FirstOrDefaultAsync(n => n.Id == id && n.QuoteId == quoteId, ct);
        if (note is null) return NotFound();
        if (Forbidden(note) is { } refusal) return BadRequest(new { message = refusal });

        db.QuoteNotes.Remove(note);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private string? Forbidden(QuoteNote note)
    {
        if (currentUser.IsSuperAdmin || currentUser.Role == UserRole.TenantAdmin) return null;
        if (note.CreatedById is { } author && author == currentUser.UserId) return null;
        return "Cette note a été écrite par quelqu'un d'autre.";
    }

    private static string? Problem(SaveProjectNoteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Body)) return "Écrivez quelque chose avant d'enregistrer.";
        if (request.Body.Trim().Length > MaxBodyLength) return "Cette note est trop longue.";
        return null;
    }

    private async Task<ActionResult<ProjectNoteDto>> OneAsync(Guid id, CancellationToken ct)
    {
        var note = await db.QuoteNotes.AsNoTracking().Where(n => n.Id == id).Select(ToDto()).FirstOrDefaultAsync(ct);
        return note is null ? NotFound() : Ok(note);
    }

    private System.Linq.Expressions.Expression<Func<QuoteNote, ProjectNoteDto>> ToDto() =>
        n => new ProjectNoteDto(
            n.Id,
            n.Body,
            db.Users.Where(u => u.Id == n.CreatedById).Select(u => u.FirstName + " " + u.LastName).FirstOrDefault(),
            n.CreatedAt,
            n.UpdatedAt);
}
