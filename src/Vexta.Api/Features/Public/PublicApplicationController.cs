using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Forms;

namespace Vexta.Api.Features.Public;

/// <summary>
/// Applying for a job from the company's public page, with no account.
///
/// The same two rules as the page it is reached from: every query names the tenant and ignores
/// the query filters, because there is no signed-in tenant to resolve them against; and nothing
/// is told to the caller that was not deliberately put in a DTO here.
///
/// A third rule applies only here, because this is the one place a stranger writes rather than
/// reads. Everything that arrives is treated as a claim, not a fact: the posting must be
/// published, its form must be published, the questions are validated by the same rules the
/// office is held to, and the candidate record is assembled from the answers' declared targets
/// rather than from anything the caller names directly. The caller never chooses a tenant, a
/// posting's owner, or a field's meaning.
/// </summary>
[ApiController]
[Route("api/public/companies/{slug}/offres")]
[AllowAnonymous]
public class PublicApplicationController(VextaDbContext db) : ControllerBase
{
    /// <summary>
    /// The questions to fill, for a posting that has a form attached.
    ///
    /// Fetched on demand rather than carried on the page: most visitors read a posting and
    /// never apply, and five postings with a dozen questions each would be paid for by every
    /// one of them.
    /// </summary>
    [HttpGet("{jobId:guid}/formulaire")]
    public async Task<ActionResult<PublicJobFormDto>> Form(string slug, Guid jobId, CancellationToken ct)
    {
        var context = await PublicJobGate.ResolveAsync(db, slug, jobId, requireForm: true, ct);
        if (context is null) return NotFound();

        var fields = await db.FormFields.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.FormTemplateId == context.FormId!.Value)
            .OrderBy(f => f.SortOrder)
            .Select(f => new PublicFormFieldDto(
                f.Id, f.Label, f.HelpText, f.Type, f.IsRequired, f.Options))
            .ToListAsync(ct);

        if (fields.Count == 0) return NotFound();

        return Ok(new PublicJobFormDto(
            context.JobTitle, context.FormTitle!, context.FormDescription, fields));
    }

}

/// <summary>The questions on a posting's form, as a visitor is shown them.</summary>
public record PublicJobFormDto(
    string JobTitle,
    string FormTitle,
    string? FormDescription,
    List<PublicFormFieldDto> Fields);

/// <summary>
/// One question. Deliberately not the staff DTO: a field also carries which record a target
/// fills and what order it was built in, and neither is a visitor's business.
/// </summary>
public record PublicFormFieldDto(
    Guid Id,
    string Label,
    string? HelpText,
    FormFieldType Type,
    bool IsRequired,
    /// <summary>The offered answers for a Choix or MultiChoix, one per line.</summary>
    string? Options);

public record PublicApplicationAnswer(Guid FieldId, string? Value);

public record SubmitPublicApplicationRequest(List<PublicApplicationAnswer>? Answers);

/// <summary>What to say back. One sentence, the company's own if it wrote one.</summary>
public record PublicApplicationResultDto(string Message);
