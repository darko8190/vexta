using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Personal;

/// <summary>
/// Somebody's own CV, and the applications they have sent.
///
/// The one controller in the application that is not about a company. Any signed-in account
/// reaches it -- an employee of a contractor has a CV too, and the point of keeping it on the
/// person is that it follows them. There is no <c>StaffOnly</c> and no
/// <c>RequireActiveSubscription</c>: a CV is not something a company's plan pays for.
///
/// Every query names <c>currentUser.UserId</c>. These rows carry no tenant, so no query filter
/// stands behind this file -- the scoping here is the only scoping there is.
/// </summary>
[ApiController]
[Route("api/mon-profil")]
[Authorize]
public class PersonalProfileController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PersonalProfileDto>> Get(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        var account = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.FirstName, u.LastName, u.Email })
            .FirstOrDefaultAsync(ct);

        if (account is null) return NotFound();

        var profile = await LoadAsync(userId, ct);

        // A profile that has never been saved is answered as an empty one rather than a 404.
        // The screen's job is to be filled in, and "not found" would make the first visit an
        // error instead of a blank page.
        return Ok(ToDto(account.FirstName, account.LastName, account.Email ?? "", profile));
    }

    [HttpPut]
    public async Task<ActionResult<PersonalProfileDto>> Save(
        SavePersonalProfileRequest request, CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var asset = request.ResumeMediaAssetId;
        if (asset is { } assetId && !await OwnsAssetAsync(assetId, ct))
        {
            return BadRequest(new { message = "Ce fichier n'existe plus." });
        }

        var profile = await db.PersonalProfiles
            .Include(p => p.Experiences)
            .Include(p => p.Education)
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);

        if (profile is null)
        {
            profile = new PersonalProfile { UserId = userId };
            db.PersonalProfiles.Add(profile);
        }

        profile.Phone = Clean(request.Phone);
        profile.Headline = Clean(request.Headline);
        profile.Summary = Clean(request.Summary);
        profile.City = Clean(request.City);
        profile.Province = Clean(request.Province);
        profile.Country = Clean(request.Country);
        profile.AvailableFrom = request.AvailableFrom;
        profile.Skills = Clean(request.Skills);
        profile.ResumeMediaAssetId = asset;
        profile.UpdatedAt = DateTimeOffset.UtcNow;

        // Replaced whole, like the questions on a form: this is one screen saved in one press,
        // and reconciling row by row would mean deciding what a missing row means.
        db.PersonalExperiences.RemoveRange(profile.Experiences);
        db.PersonalEducation.RemoveRange(profile.Education);
        profile.Experiences.Clear();
        profile.Education.Clear();

        var order = 0;
        foreach (var experience in request.Experiences ?? [])
        {
            if (string.IsNullOrWhiteSpace(experience.Title)) continue;

            // Added through the set rather than the navigation: an entity reached through a
            // navigation with its key already set is read as an update of a row that was just
            // deleted, which is a concurrency failure rather than an insert.
            db.PersonalExperiences.Add(new PersonalExperience
            {
                UserId = userId,
                Title = experience.Title.Trim(),
                Employer = Clean(experience.Employer),
                Location = Clean(experience.Location),
                StartedOn = experience.StartedOn,
                EndedOn = experience.EndedOn,
                Description = Clean(experience.Description),
                SortOrder = order++
            });
        }

        order = 0;
        foreach (var education in request.Education ?? [])
        {
            if (string.IsNullOrWhiteSpace(education.Program)) continue;

            db.PersonalEducation.Add(new PersonalEducation
            {
                UserId = userId,
                Program = education.Program.Trim(),
                School = Clean(education.School),
                CompletedYear = education.CompletedYear,
                Notes = Clean(education.Notes),
                SortOrder = order++
            });
        }

        await db.SaveChangesAsync(ct);
        return await Get(ct);
    }

    /// <summary>
    /// What this person has applied to, read from the candidate cards their applications
    /// created.
    ///
    /// Across tenants, which is why it selects only what the applicant already knows: the
    /// position they applied to, the company they applied to, where it stands and when. Nothing
    /// else on that card -- the company's own notes on them above all -- is theirs to read.
    /// </summary>
    [HttpGet("candidatures")]
    public async Task<ActionResult<List<MyApplicationDto>>> Applications(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        // Joined rather than navigated: Candidate carries a TenantId but no navigation to it,
        // and it should not grow one for this -- a candidate belongs to a company, it is not a
        // way to read one.
        var items = await db.Candidates.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.ApplicantUserId == userId)
            .Join(
                db.Tenants.IgnoreQueryFilters().AsNoTracking(),
                c => c.TenantId,
                t => t.Id,
                (c, t) => new { Candidate = c, Company = t })
            .OrderByDescending(row => row.Candidate.AppliedOn)
            .Select(row => new MyApplicationDto(
                row.Candidate.Id,
                row.Candidate.JobPostingId,
                row.Candidate.JobPosting == null
                    ? (row.Candidate.DesiredJobTitle ?? "Candidature")
                    : row.Candidate.JobPosting.Title,
                row.Company.Name,
                row.Company.Slug,
                row.Candidate.Status,
                row.Candidate.AppliedOn))
            .ToListAsync(ct);

        return Ok(items);
    }

    /// <summary>
    /// The CV as a document: what somebody prints, brings to an interview, or attaches to an
    /// email sent to a company that is not on Vexta at all.
    ///
    /// The same CV the companies here receive as text, set on paper -- one model renders both,
    /// so there is no version of this that says something the application did not.
    ///
    /// Refused while there is nothing on it but a name. A page with a name and a blank space
    /// under it is worse than no document: somebody would send it.
    /// </summary>
    [HttpGet("pdf")]
    public async Task<IActionResult> Pdf(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Forbid();

        var account = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.FirstName, u.LastName, u.Email })
            .FirstOrDefaultAsync(ct);

        if (account is null) return NotFound();

        var profile = await LoadAsync(userId, ct);
        if (profile is null)
        {
            return BadRequest(new { message = "Remplissez votre CV avant de le télécharger." });
        }

        // No covering note: that is written for one position and belongs to that application,
        // not to the CV somebody keeps.
        var cv = CvModel.From(account.FirstName, account.LastName, account.Email, profile, null);

        if (!cv.HasContent)
        {
            return BadRequest(new { message = "Remplissez votre CV avant de le télécharger." });
        }

        Response.Headers.ContentDisposition = $"inline; filename=\"{FileName(cv.Name)}\"";
        return File(new CvDocument(cv).GeneratePdf(), "application/pdf");
    }

    // ---- Helpers ----

    private Task<PersonalProfile?> LoadAsync(Guid userId, CancellationToken ct) =>
        db.PersonalProfiles.AsNoTracking()
            .Include(p => p.Experiences.OrderBy(x => x.SortOrder))
            .Include(p => p.Education.OrderBy(x => x.SortOrder))
            .Include(p => p.ResumeMediaAsset)
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);

    /// <summary>
    /// Whether that file is one this person uploaded. The id arrives from the browser, and a CV
    /// pointing at somebody else's file would put its name on this person's applications.
    ///
    /// Scoped by the tenant the account belongs to, which for a personal account is its own
    /// space: that is where its uploads live.
    /// </summary>
    private async Task<bool> OwnsAssetAsync(Guid assetId, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return false;

        return await db.MediaAssets.IgnoreQueryFilters()
            .AnyAsync(m => m.Id == assetId && m.TenantId == tenantId, ct);
    }

    private static PersonalProfileDto ToDto(
        string firstName, string lastName, string email, PersonalProfile? profile)
    {
        var experiences = profile?.Experiences
            .Select(x => new PersonalExperienceDto(
                x.Id, x.Title, x.Employer, x.Location, x.StartedOn, x.EndedOn, x.Description, x.SortOrder))
            .ToList() ?? [];

        var education = profile?.Education
            .Select(x => new PersonalEducationDto(
                x.Id, x.Program, x.School, x.CompletedYear, x.Notes, x.SortOrder))
            .ToList() ?? [];

        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(profile?.Phone)) missing.Add("un numéro de téléphone");
        if (experiences.Count == 0 && profile?.ResumeMediaAssetId is null)
        {
            missing.Add("une expérience de travail ou un CV téléversé");
        }

        return new PersonalProfileDto(
            firstName,
            lastName,
            email,
            profile?.Phone,
            profile?.Headline,
            profile?.Summary,
            profile?.City,
            profile?.Province,
            profile?.Country,
            profile?.AvailableFrom,
            profile?.Skills,
            profile?.ResumeMediaAssetId,
            profile?.ResumeMediaAsset?.FileName,
            experiences,
            education,
            missing.Count == 0,
            missing,
            profile is not null && CvModel.From(firstName, lastName, email, profile, null).HasContent,
            profile?.UpdatedAt);
    }

    private static string? Problem(SavePersonalProfileRequest r)
    {
        if (r.Phone is { Length: > 40 }) return "Le téléphone ne peut pas dépasser 40 caractères.";
        if (r.Headline is { Length: > 200 }) return "Le titre ne peut pas dépasser 200 caractères.";
        if (r.Summary is { Length: > 4000 }) return "Le résumé ne peut pas dépasser 4000 caractères.";
        if (r.Skills is { Length: > 2000 }) return "Les compétences ne peuvent pas dépasser 2000 caractères.";

        // Twenty jobs and ten diplomas is already a long career written out in full. Past that
        // it is a paste, and every row is storage somebody else pays for.
        if (r.Experiences is { Count: > 20 }) return "Vingt expériences au maximum.";
        if (r.Education is { Count: > 10 }) return "Dix formations au maximum.";

        foreach (var experience in r.Experiences ?? [])
        {
            if (experience.Title is { Length: > 200 }) return "Un titre de poste est trop long.";
            if (experience is { StartedOn: { } start, EndedOn: { } end } && end < start)
            {
                return "Une date de fin précède sa date de début.";
            }
        }

        foreach (var education in r.Education ?? [])
        {
            if (education.Program is { Length: > 200 }) return "Un nom de formation est trop long.";
            if (education.CompletedYear is { } year && (year < 1950 || year > DateTime.UtcNow.Year + 10))
            {
                return "Une année de formation est hors de l'ordinaire.";
            }
        }

        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// "CV-Marc-Belanger.pdf". Accents folded and anything else dropped: the name comes from a
    /// text box, and a Content-Disposition filename carrying an accent or a quotation mark
    /// arrives mangled, renamed or not at all, depending on the browser.
    /// </summary>
    private static string FileName(string name)
    {
        var folded = name.Normalize(NormalizationForm.FormD)
            .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark);

        var safe = new StringBuilder();
        foreach (var c in folded)
        {
            if (char.IsAsciiLetterOrDigit(c)) safe.Append(c);
            else if (safe.Length > 0 && safe[^1] != '-') safe.Append('-');
        }

        var trimmed = safe.ToString().Trim('-');
        return trimmed.Length == 0 ? "CV.pdf" : $"CV-{trimmed}.pdf";
    }
}
