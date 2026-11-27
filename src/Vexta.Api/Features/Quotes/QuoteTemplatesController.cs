using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Quotes;

/// <summary>
/// Quote templates: the lines of a kind of job, kept to start new quotes from. Made from a quote
/// (POST soumissions/{id}/modele) and used when creating one (TemplateId on the create request);
/// here they are only listed and removed.
/// </summary>
[ApiController]
[Route("api/modeles-soumission")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
[RequireActiveSubscription]
public class QuoteTemplatesController(VextaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<QuoteTemplateDto>>> List(CancellationToken ct) =>
        Ok(await db.QuoteTemplates.AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(ToDto())
            .ToListAsync(ct));

    /// <summary>A template with its lines, to read what it holds before using it.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<QuoteTemplateDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var template = await db.QuoteTemplates.AsNoTracking().Where(t => t.Id == id).Select(ToDto()).FirstOrDefaultAsync(ct);
        if (template is null) return NotFound();
        var lines = await db.QuoteTemplateLines.AsNoTracking()
            .Where(l => l.TemplateId == id)
            .OrderBy(l => l.Kind).ThenBy(l => l.SortOrder)
            .Select(l => new QuoteTemplateLineDto(l.Id, l.Kind, l.Description, l.Unit, l.Quantity, l.UnitCost, l.UnitPrice, l.IsOptional))
            .ToListAsync(ct);
        return Ok(new QuoteTemplateDetailDto(template, lines));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var template = await db.QuoteTemplates.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (template is null) return NotFound();

        // Quotes made from it keep their own copy of the lines, so nothing else moves.
        db.QuoteTemplates.Remove(template);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    internal static System.Linq.Expressions.Expression<Func<QuoteTemplate, QuoteTemplateDto>> ToDto() => t =>
        new QuoteTemplateDto(
            t.Id,
            t.Name,
            t.Description,
            t.Lines.Count,
            t.Lines.Where(l => !l.IsOptional).Sum(l => Math.Round(l.Quantity * l.UnitPrice, 2)),
            t.DepositPercent,
            t.UpdatedAt);
}

public record QuoteTemplateLineDto(
    Guid Id, QuoteLineKind Kind, string Description, string? Unit, decimal Quantity, decimal? UnitCost, decimal UnitPrice, bool IsOptional);

public record QuoteTemplateDetailDto(QuoteTemplateDto Template, List<QuoteTemplateLineDto> Lines);
