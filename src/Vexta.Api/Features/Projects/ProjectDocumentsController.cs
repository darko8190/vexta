using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// The files filed against one project: the plan, the permit, the signed quote, the photographs
/// of the finished work.
///
/// Client is in the role list, unlike the expenses and the materials. A document of the job is
/// not a figure of the margin: the plan and the permit are the customer's own paperwork, and
/// refusing them the plan of their own extension would be a promise nobody made. The query
/// filter confines them to their own project, and <see cref="StaffOnlyAttribute"/> on every
/// write is what stops them filing anything.
/// </summary>
[ApiController]
[Route("api/projects/{projectId:guid}/documents")]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)},{nameof(UserRole.Client)}")]
[RequireActiveSubscription]
public class ProjectDocumentsController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IR2StorageService storage) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ProjectDocumentDto>>> List(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        return Ok(await LoadAsync(projectId, ct));
    }

    [HttpPost]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectDocumentDto>> Create(
        Guid projectId, SaveProjectDocumentRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        // Not locked when the job is billed, unlike its materials and its hours: a plan or a
        // permit still arrives after the invoice, and filing one changes no amount. The lock on
        // this project is about the figures the client was charged from — see ProjectLock.

        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        // The query filter already scopes the library to the tenant, so an id from somewhere
        // else simply is not found rather than being attachable and then readable through this.
        if (!await db.MediaAssets.AnyAsync(m => m.Id == request.MediaAssetId, ct))
        {
            return BadRequest(new { message = "Le fichier téléversé est introuvable." });
        }

        var document = new ProjectDocument
        {
            TenantId = tenantId,
            ProjectId = projectId,
            Title = request.Title.Trim(),
            Category = Clean(request.Category),
            MediaAssetId = request.MediaAssetId,
            UploadedById = currentUser.UserId
        };

        db.ProjectDocuments.Add(document);
        await db.SaveChangesAsync(ct);

        return await OneAsync(projectId, document.Id, ct);
    }

    /// <summary>
    /// Only the title and the filing change here. Replacing the file would silently turn the
    /// document someone already opened into another one, so that is an upload of its own.
    /// </summary>
    [HttpPut("{id:guid}")]
    [StaffOnly]
    public async Task<ActionResult<ProjectDocumentDto>> Update(
        Guid projectId, Guid id, SaveProjectDocumentRequest request, CancellationToken ct)
    {
        var document = await db.ProjectDocuments
            .FirstOrDefaultAsync(d => d.Id == id && d.ProjectId == projectId, ct);
        if (document is null) return NotFound();

        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        document.Title = request.Title.Trim();
        document.Category = Clean(request.Category);
        await db.SaveChangesAsync(ct);

        return await OneAsync(projectId, id, ct);
    }

    [HttpDelete("{id:guid}")]
    [StaffOnly]
    public async Task<IActionResult> Delete(Guid projectId, Guid id, CancellationToken ct)
    {
        var document = await db.ProjectDocuments
            .FirstOrDefaultAsync(d => d.Id == id && d.ProjectId == projectId, ct);
        if (document is null) return NotFound();

        // Only the row filed against the job goes. The file stays in the library, where it may
        // be in use elsewhere, and removing it is that page's decision to make.
        db.ProjectDocuments.Remove(document);
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

    private async Task<ActionResult<ProjectDocumentDto>> OneAsync(Guid projectId, Guid id, CancellationToken ct)
    {
        var documents = await LoadAsync(projectId, ct);
        var document = documents.FirstOrDefault(d => d.Id == id);

        return document is null ? NotFound() : Ok(document);
    }

    /// <summary>
    /// The documents with a link each. A link that cannot be signed comes back null rather than
    /// failing the request: the list of what the job holds is still worth showing when the file
    /// storage is unreachable or has never been configured.
    /// </summary>
    private async Task<List<ProjectDocumentDto>> LoadAsync(Guid projectId, CancellationToken ct)
    {
        var rows = await db.ProjectDocuments.AsNoTracking()
            .Where(d => d.ProjectId == projectId)
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
                d.CreatedAt
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
                // Storage is not configured, or its credentials are wrong. Said once by the
                // page, not once per document.
            }

            documents.Add(new ProjectDocumentDto(
                row.Id,
                row.Title,
                row.Category,
                row.MediaAssetId,
                row.FileName,
                row.ContentType,
                row.SizeBytes,
                url,
                row.UploadedByName,
                row.CreatedAt));
        }

        return documents;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
