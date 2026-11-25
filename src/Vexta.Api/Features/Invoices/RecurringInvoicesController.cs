using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Invoices;

/// <summary>
/// The schedules that issue an invoice again every period (see RecurringInvoiceService). Made
/// from an existing invoice, which is what gets copied; the company's staff read them, its
/// managers set them.
/// </summary>
[ApiController]
[Route("api/invoices/recurrences")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
[RequireActiveSubscription]
public class RecurringInvoicesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    private static readonly int[] Intervals = [1, 2, 3, 6, 12];

    /// <summary>Every schedule, or the one made from <paramref name="invoiceId"/>.</summary>
    [HttpGet]
    public async Task<ActionResult<List<RecurringInvoiceDto>>> List([FromQuery] Guid? invoiceId, CancellationToken ct)
    {
        var query = db.RecurringInvoices.AsNoTracking();
        if (invoiceId is { } id) query = query.Where(r => r.SourceInvoiceId == id);

        return Ok(await query
            .OrderByDescending(r => r.IsActive).ThenBy(r => r.NextIssueDate)
            .Select(Projection)
            .ToListAsync(ct));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [RequireBusinessTenant]
    public async Task<ActionResult<RecurringInvoiceDto>> Create(SaveRecurringInvoiceRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var source = await db.Invoices.AsNoTracking()
            .Include(i => i.Client)
            .FirstOrDefaultAsync(i => i.Id == request.SourceInvoiceId, ct);
        if (source is null) return NotFound();
        if (source.Status == InvoiceStatus.Annulee)
            return BadRequest(new { message = "Une facture annulée ne peut pas servir de modèle." });
        if (source.Client!.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });
        if (await db.RecurringInvoices.AnyAsync(r => r.SourceInvoiceId == source.Id, ct))
            return BadRequest(new { message = "Cette facture a déjà une récurrence. Modifiez-la plutôt." });
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        var recurrence = new RecurringInvoice
        {
            TenantId = tenantId,
            ClientId = source.ClientId,
            SourceInvoiceId = source.Id,
        };
        Apply(recurrence, request);
        db.RecurringInvoices.Add(recurrence);
        await db.SaveChangesAsync(ct);

        return Ok(await LoadAsync(recurrence.Id, ct));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<RecurringInvoiceDto>> Update(Guid id, SaveRecurringInvoiceRequest request, CancellationToken ct)
    {
        var recurrence = await db.RecurringInvoices.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (recurrence is null) return NotFound();
        if (Problem(request) is { } problem) return BadRequest(new { message = problem });

        Apply(recurrence, request);
        recurrence.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(await LoadAsync(id, ct));
    }

    /// <summary>Stopped for good. The invoices it already made stay as they are.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var recurrence = await db.RecurringInvoices.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (recurrence is null) return NotFound();
        db.RecurringInvoices.Remove(recurrence);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// A saved schedule starts counting again from the date given: changing the frequency or the
    /// next date is a new plan, not a correction of the old one's arithmetic.
    /// </summary>
    private static void Apply(RecurringInvoice recurrence, SaveRecurringInvoiceRequest request)
    {
        recurrence.IntervalMonths = request.IntervalMonths;
        recurrence.StartDate = request.NextIssueDate;
        recurrence.Periods = 0;
        recurrence.NextIssueDate = request.NextIssueDate;
        recurrence.EndDate = request.EndDate;
        recurrence.AutoSend = request.AutoSend;
        recurrence.IsActive = true;
        recurrence.LastProblem = null;
    }

    private static string? Problem(SaveRecurringInvoiceRequest request)
    {
        if (!Intervals.Contains(request.IntervalMonths)) return "Choisissez une fréquence dans la liste.";
        // From today on: a date in the past would issue the missed invoices one after the other.
        if (request.NextIssueDate < BusinessDay.Today)
            return "La prochaine facture ne peut pas être datée dans le passé.";
        if (request.EndDate is { } end && end < request.NextIssueDate)
            return "La date de fin doit suivre la prochaine facture.";
        return null;
    }

    private Task<RecurringInvoiceDto?> LoadAsync(Guid id, CancellationToken ct) =>
        db.RecurringInvoices.AsNoTracking().Where(r => r.Id == id).Select(Projection).FirstOrDefaultAsync(ct);

    private static readonly System.Linq.Expressions.Expression<Func<RecurringInvoice, RecurringInvoiceDto>> Projection =
        r => new RecurringInvoiceDto(
            r.Id,
            r.ClientId,
            r.Client!.Name,
            r.SourceInvoiceId,
            r.SourceInvoice!.Number,
            r.IntervalMonths,
            r.NextIssueDate,
            r.EndDate,
            r.AutoSend,
            r.IsActive,
            r.Periods,
            r.LastInvoiceId,
            r.LastInvoice == null ? null : r.LastInvoice.Number,
            r.LastIssuedAt,
            r.LastProblem);
}

/// <param name="Periods">Invoices issued since the schedule was last set.</param>
/// <param name="LastProblem">Why the last one stayed a draft although it was to be sent.</param>
public record RecurringInvoiceDto(
    Guid Id,
    Guid ClientId,
    string ClientName,
    Guid SourceInvoiceId,
    string SourceInvoiceNumber,
    int IntervalMonths,
    DateOnly NextIssueDate,
    DateOnly? EndDate,
    bool AutoSend,
    bool IsActive,
    int Periods,
    Guid? LastInvoiceId,
    string? LastInvoiceNumber,
    DateTimeOffset? LastIssuedAt,
    string? LastProblem);

/// <param name="SourceInvoiceId">The invoice to copy; ignored on an update.</param>
public record SaveRecurringInvoiceRequest(
    Guid SourceInvoiceId, int IntervalMonths, DateOnly NextIssueDate, DateOnly? EndDate, bool AutoSend);
