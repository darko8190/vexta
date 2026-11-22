using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// The thread of dated entries kept on one project.
///
/// Staff only, including for reading, and that is the whole point of the notes: they are the
/// company's internal log of the job — the client changed their mind on site, the crew lost two
/// days waiting on the inspector, this one is not worth quoting again. The documents next to
/// them are the customer's paperwork and they do read those; this is what is said about them.
/// </summary>
[ApiController]
[Route("api/projects/{projectId:guid}/notes")]
[StaffOnly]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public class ProjectNotesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    private const int MaxBodyLength = 4000;

    [HttpGet]
    public async Task<ActionResult<List<ProjectNoteDto>>> List(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        // Newest first: the thread is read from the top, because what happened yesterday is
        // what the next person needs before they drive out there.
        var items = await db.ProjectNotes.AsNoTracking()
            .Where(n => n.ProjectId == projectId)
            .OrderByDescending(n => n.CreatedAt)
            .Select(ToDto())
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectNoteDto>> Create(
        Guid projectId, SaveProjectNoteRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        // No ProjectLock here, unlike the documents beside them. A billed job is still a job
        // people talk about afterwards — the warranty call, the deficiency the client reported
        // in March — and a log that stops the day the invoice goes out is a log nobody trusts.
        var note = new ProjectNote
        {
            TenantId = tenantId,
            ProjectId = projectId,
            Body = request.Body.Trim(),
            CreatedById = currentUser.UserId
        };

        db.ProjectNotes.Add(note);
        await db.SaveChangesAsync(ct);

        return await OneAsync(note.Id, ct);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProjectNoteDto>> Update(
        Guid projectId, Guid id, SaveProjectNoteRequest request, CancellationToken ct)
    {
        var note = await db.ProjectNotes.FirstOrDefaultAsync(n => n.Id == id && n.ProjectId == projectId, ct);
        if (note is null) return NotFound();
        if (Forbidden(note) is { } refusal) return BadRequest(new { message = refusal });
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        note.Body = request.Body.Trim();
        note.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return await OneAsync(id, ct);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid projectId, Guid id, CancellationToken ct)
    {
        var note = await db.ProjectNotes.FirstOrDefaultAsync(n => n.Id == id && n.ProjectId == projectId, ct);
        if (note is null) return NotFound();
        if (Forbidden(note) is { } refusal) return BadRequest(new { message = refusal });

        db.ProjectNotes.Remove(note);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// An entry is signed by whoever wrote it, so only they may change it afterwards. The owner
    /// of the account keeps the key, because someone has to be able to take down what should
    /// never have been written and the author may have left the company.
    /// </summary>
    private string? Forbidden(ProjectNote note)
    {
        if (currentUser.IsSuperAdmin || currentUser.Role == UserRole.TenantAdmin) return null;
        if (note.CreatedById is { } author && author == currentUser.UserId) return null;

        return "Cette note a été écrite par quelqu'un d'autre.";
    }

    private static string? Problem(SaveProjectNoteRequest request)
    {
        // An empty note is a row that says nothing, which is worse than no row: the thread is
        // read top to bottom and a blank entry costs the reader a moment every time.
        if (string.IsNullOrWhiteSpace(request.Body)) return "Écrivez quelque chose avant d'enregistrer.";
        if (request.Body.Trim().Length > MaxBodyLength) return "Cette note est trop longue.";

        return null;
    }

    private async Task<ActionResult<ProjectNoteDto>> OneAsync(Guid id, CancellationToken ct)
    {
        var note = await db.ProjectNotes.AsNoTracking()
            .Where(n => n.Id == id)
            .Select(ToDto())
            .FirstOrDefaultAsync(ct);

        return note is null ? NotFound() : Ok(note);
    }

    /// <summary>
    /// The author's name is looked up rather than joined through a navigation: the note keeps
    /// an id, and a user who has been removed leaves the entry standing without a name.
    /// </summary>
    private System.Linq.Expressions.Expression<Func<ProjectNote, ProjectNoteDto>> ToDto() =>
        n => new ProjectNoteDto(
            n.Id,
            n.Body,
            db.Users.Where(u => u.Id == n.CreatedById)
                .Select(u => u.FirstName + " " + u.LastName)
                .FirstOrDefault(),
            n.CreatedAt,
            n.UpdatedAt);
}
