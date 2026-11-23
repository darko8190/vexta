using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Hr;

/// <summary>
/// People who applied.
///
/// Hiring one creates the employee record and links the two, which is the only write here that
/// touches anything outside this table. It is deliberately not reversible from this end: an
/// employee who turns out to be a mistake is dealt with on their own file, and unhiring from the
/// application would leave timesheets pointing at somebody the company says it never took on.
/// </summary>
[ApiController]
[Route("api/candidats")]
[StaffOnly]
[Authorize(Roles = Roles.Managers)]
[RequireActiveSubscription]
public class CandidatesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    /// <param name="statut">Only candidates in this state.</param>
    /// <param name="recherche">Matches a name, the job they want, or where they came from.</param>
    [HttpGet]
    public async Task<ActionResult<List<CandidateDto>>> List(
        [FromQuery] CandidateStatus? statut, [FromQuery] string? recherche, CancellationToken ct)
    {
        var query = db.Candidates.AsNoTracking().AsQueryable();

        if (statut is { } status) query = query.Where(c => c.Status == status);

        if (!string.IsNullOrWhiteSpace(recherche))
        {
            var term = recherche.Trim().ToLower();
            query = query.Where(c =>
                c.FirstName.ToLower().Contains(term)
                || c.LastName.ToLower().Contains(term)
                || (c.DesiredJobTitle != null && c.DesiredJobTitle.ToLower().Contains(term))
                || (c.Source != null && c.Source.ToLower().Contains(term)));
        }

        var items = await query
            // Newest application first: a pile of CVs is worked from the top.
            .OrderByDescending(c => c.AppliedOn).ThenByDescending(c => c.CreatedAt)
            .Select(Projection())
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<CandidateDto>> Create(SaveCandidateRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (await ValidateAsync(request, ct) is { } error) return BadRequest(new { message = error });

        var candidate = new Candidate
        {
            TenantId = tenantId,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Email = Clean(request.Email),
            Phone = Clean(request.Phone),
            DesiredJobTitle = Clean(request.DesiredJobTitle),
            Source = Clean(request.Source),
            Status = request.Status,
            // Today when nobody said: a CV handed over at the counter was handed over today.
            AppliedOn = request.AppliedOn ?? BusinessDay.Today,
            ResumeMediaAssetId = request.ResumeMediaAssetId,
            Notes = Clean(request.Notes)
        };

        db.Candidates.Add(candidate);
        await db.SaveChangesAsync(ct);

        return Ok(await DtoAsync(candidate.Id, ct));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CandidateDto>> Update(Guid id, SaveCandidateRequest request, CancellationToken ct)
    {
        var candidate = await db.Candidates.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (candidate is null) return NotFound();
        if (await ValidateAsync(request, ct) is { } error) return BadRequest(new { message = error });

        // Embauche is set by hiring, never by the form. Letting it be chosen here would produce
        // a candidate marked hired with no employee behind them.
        if (request.Status == CandidateStatus.Embauche && candidate.EmployeeId is null)
        {
            return BadRequest(new { message = "Utilisez « Embaucher » : c'est ce qui crée la fiche d'employé." });
        }

        candidate.FirstName = request.FirstName.Trim();
        candidate.LastName = request.LastName.Trim();
        candidate.Email = Clean(request.Email);
        candidate.Phone = Clean(request.Phone);
        candidate.DesiredJobTitle = Clean(request.DesiredJobTitle);
        candidate.Source = Clean(request.Source);
        candidate.Status = candidate.EmployeeId is not null ? CandidateStatus.Embauche : request.Status;
        candidate.AppliedOn = request.AppliedOn ?? candidate.AppliedOn;
        candidate.ResumeMediaAssetId = request.ResumeMediaAssetId;
        candidate.Notes = Clean(request.Notes);
        candidate.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(await DtoAsync(id, ct));
    }

    /// <summary>
    /// Creates the employee and links them. The employee is created on file only — no access,
    /// no seat consumed — because deciding to hire somebody and deciding to give them a login
    /// are two different decisions, made by two different people on two different days.
    /// </summary>
    [HttpPost("{id:guid}/embaucher")]
    [Authorize(Roles = Roles.Owner)]
    [RequireBusinessTenant]
    public async Task<ActionResult<CandidateDto>> Hire(Guid id, HireCandidateRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var candidate = await db.Candidates.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (candidate is null) return NotFound();

        if (candidate.EmployeeId is not null)
        {
            return Conflict(new { message = "Ce candidat a déjà été embauché." });
        }

        var email = request.Email?.Trim();
        if (string.IsNullOrWhiteSpace(email))
        {
            return BadRequest(new { message = "Un courriel est obligatoire : c'est l'identifiant si vous lui donnez un accès plus tard." });
        }

        if (await db.Employees.AnyAsync(e => e.Email.ToLower() == email.ToLower(), ct))
        {
            return Conflict(new { message = "Un employé utilise déjà ce courriel." });
        }

        var employee = new Employee
        {
            TenantId = tenantId,
            FirstName = candidate.FirstName,
            LastName = candidate.LastName,
            Email = email,
            Phone = candidate.Phone,
            JobTitle = Clean(request.JobTitle) ?? candidate.DesiredJobTitle,
            Role = UserRole.TenantUser
        };

        db.Employees.Add(employee);

        candidate.EmployeeId = employee.Id;
        candidate.Status = CandidateStatus.Embauche;
        candidate.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(await DtoAsync(id, ct));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Owner)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var candidate = await db.Candidates.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (candidate is null) return NotFound();

        db.Candidates.Remove(candidate);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---- Helpers ----

    private async Task<CandidateDto> DtoAsync(Guid id, CancellationToken ct) =>
        await db.Candidates.AsNoTracking().Where(c => c.Id == id).Select(Projection()).FirstAsync(ct);

    private static System.Linq.Expressions.Expression<Func<Candidate, CandidateDto>> Projection() =>
        c => new CandidateDto(
            c.Id,
            c.FirstName,
            c.LastName,
            c.Email,
            c.Phone,
            c.DesiredJobTitle,
            c.Source,
            c.Status,
            c.AppliedOn,
            c.ResumeMediaAssetId,
            c.ResumeMediaAsset != null ? c.ResumeMediaAsset.FileName : null,
            c.Notes,
            c.EmployeeId);

    private async Task<string?> ValidateAsync(SaveCandidateRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.FirstName)) return "Le prénom est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.LastName)) return "Le nom est obligatoire.";
        if (r.ResumeMediaAssetId is { } assetId && !await db.MediaAssets.AnyAsync(m => m.Id == assetId, ct))
        {
            return "Ce fichier n'existe plus.";
        }
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
