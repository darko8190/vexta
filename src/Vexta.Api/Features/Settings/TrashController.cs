using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Settings;

/// <summary>One thing in the corbeille, with enough to recognise it before restoring it.</summary>
public record TrashItemDto(
    string Type,
    Guid Id,
    string Title,
    string? Subtitle,
    DateTimeOffset DeletedAt,
    string? DeletedBy,
    IReadOnlyList<TrashFieldDto> Details);

public record TrashFieldDto(string Label, string Value);

public record TrashEmptyResultDto(int Deleted, int Kept, IReadOnlyList<string> Problems);

/// <summary>
/// The corbeille: every client, project, quote, invoice, product, equipment and supplier that
/// was deleted, still in the database and left out of every screen. From here a record is
/// looked at, put back, or deleted for good. Managers only.
/// </summary>
[ApiController]
[Route("api/corbeille")]
[Authorize(Roles = Roles.Managers)]
[StaffOnly]
public class TrashController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    private Guid TenantId => currentUser.TenantId ?? Guid.Empty;

    [HttpGet]
    public async Task<ActionResult<List<TrashItemDto>>> List(CancellationToken ct)
    {
        var tenant = TenantId;
        var items = new List<TrashItemDto>();

        items.AddRange((await db.Clients.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TenantId == tenant && x.DeletedAt != null)
            .Select(x => new { x.Id, x.Number, x.Name, x.Email, x.Phone, x.DeletedAt, x.DeletedByUserId })
            .ToListAsync(ct))
            .Select(x => Item("client", x.Id, x.Name, $"C-{x.Number:0000}", x.DeletedAt!.Value, x.DeletedByUserId,
                ("Numéro", $"C-{x.Number:0000}"), ("Courriel", x.Email), ("Téléphone", x.Phone))));

        items.AddRange((await db.Projects.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TenantId == tenant && x.DeletedAt != null)
            .Select(x => new { x.Id, x.Number, Client = x.Client!.Name, x.Description, x.Status, x.DeletedAt, x.DeletedByUserId })
            .ToListAsync(ct))
            .Select(x => Item("projet", x.Id, $"P-{x.Number:0000} · {x.Client}", x.Description, x.DeletedAt!.Value, x.DeletedByUserId,
                ("Client", x.Client), ("Description", x.Description), ("État", x.Status.ToString()))));

        items.AddRange((await db.Quotes.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TenantId == tenant && x.DeletedAt != null)
            .Select(x => new { x.Id, x.Number, Client = x.Client!.Name, x.Description, x.Status, x.IssuedOn, x.DeletedAt, x.DeletedByUserId })
            .ToListAsync(ct))
            .Select(x => Item("soumission", x.Id, $"S-{x.Number:0000} · {x.Client}", x.Description, x.DeletedAt!.Value, x.DeletedByUserId,
                ("Client", x.Client), ("Description", x.Description), ("État", x.Status.ToString()), ("Date", x.IssuedOn?.ToString("yyyy-MM-dd")))));

        items.AddRange((await db.Invoices.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TenantId == tenant && x.DeletedAt != null)
            .Select(x => new
            {
                x.Id, x.Number, Client = x.Client!.Name, x.Status, x.IssueDate, x.DueDate, x.DeletedAt, x.DeletedByUserId,
                Subtotal = x.Lines.Sum(l => l.Quantity * l.UnitPrice)
            })
            .ToListAsync(ct))
            .Select(x => Item("facture", x.Id, $"{x.Number} · {x.Client}", null, x.DeletedAt!.Value, x.DeletedByUserId,
                ("Client", x.Client), ("État", x.Status.ToString()), ("Émise le", x.IssueDate.ToString("yyyy-MM-dd")),
                ("Échéance", x.DueDate.ToString("yyyy-MM-dd")), ("Sous-total", x.Subtotal.ToString("0.00") + " $"))));

        items.AddRange((await db.Products.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TenantId == tenant && x.DeletedAt != null)
            .Select(x => new { x.Id, x.Number, x.Title, x.Code, x.DeletedAt, x.DeletedByUserId })
            .ToListAsync(ct))
            .Select(x => Item("produit", x.Id, x.Title, $"A-{x.Number:0000}", x.DeletedAt!.Value, x.DeletedByUserId,
                ("Numéro", $"A-{x.Number:0000}"), ("Code", x.Code))));

        items.AddRange((await db.Equipment.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TenantId == tenant && x.DeletedAt != null)
            .Select(x => new { x.Id, x.Number, x.Name, x.SerialNumber, x.DeletedAt, x.DeletedByUserId })
            .ToListAsync(ct))
            .Select(x => Item("equipement", x.Id, x.Name, $"EQ-{x.Number:0000}", x.DeletedAt!.Value, x.DeletedByUserId,
                ("Numéro", $"EQ-{x.Number:0000}"), ("Numéro de série", x.SerialNumber))));

        items.AddRange((await db.Suppliers.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.TenantId == tenant && x.DeletedAt != null)
            .Select(x => new { x.Id, x.Name, x.ContactName, x.Email, x.DeletedAt, x.DeletedByUserId })
            .ToListAsync(ct))
            .Select(x => Item("fournisseur", x.Id, x.Name, x.ContactName, x.DeletedAt!.Value, x.DeletedByUserId,
                ("Contact", x.ContactName), ("Courriel", x.Email))));

        var userIds = items.Select(i => i.DeletedBy).OfType<string>().Distinct().Select(Guid.Parse).ToList();
        var names = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id.ToString(), u => (u.FirstName + " " + u.LastName).Trim(), ct);

        return Ok(items
            .Select(i => i with { DeletedBy = i.DeletedBy is { } by ? names.GetValueOrDefault(by) : null })
            .OrderByDescending(i => i.DeletedAt)
            .ToList());
    }

    [HttpPost("{type}/{id:guid}/restaurer")]
    public async Task<IActionResult> Restore(string type, Guid id, CancellationToken ct)
    {
        var record = await FindAsync(type, id, ct);
        if (record is null) return NotFound();
        record.DeletedAt = null;
        record.DeletedByUserId = null;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{type}/{id:guid}")]
    public async Task<IActionResult> Purge(string type, Guid id, CancellationToken ct)
    {
        var record = await FindAsync(type, id, ct);
        if (record is null) return NotFound();
        return await PurgeAsync([record], ct) is { Problems.Count: > 0 } result
            ? Conflict(new { message = result.Problems[0] })
            : NoContent();
    }

    /// <summary>Empties the corbeille. What cannot go (still used elsewhere) stays, and is named.</summary>
    [HttpDelete]
    public async Task<ActionResult<TrashEmptyResultDto>> EmptyTrash(CancellationToken ct)
    {
        var tenant = TenantId;
        var records = new List<ISoftDeletable>();
        // Children before parents: invoices and quotes before their projects, projects before clients.
        records.AddRange(await db.Invoices.IgnoreQueryFilters().Where(x => x.TenantId == tenant && x.DeletedAt != null).ToListAsync(ct));
        records.AddRange(await db.Quotes.IgnoreQueryFilters().Where(x => x.TenantId == tenant && x.DeletedAt != null).ToListAsync(ct));
        records.AddRange(await db.Projects.IgnoreQueryFilters().Where(x => x.TenantId == tenant && x.DeletedAt != null).ToListAsync(ct));
        records.AddRange(await db.Clients.IgnoreQueryFilters().Where(x => x.TenantId == tenant && x.DeletedAt != null).ToListAsync(ct));
        records.AddRange(await db.Products.IgnoreQueryFilters().Where(x => x.TenantId == tenant && x.DeletedAt != null).ToListAsync(ct));
        records.AddRange(await db.Equipment.IgnoreQueryFilters().Where(x => x.TenantId == tenant && x.DeletedAt != null).ToListAsync(ct));
        records.AddRange(await db.Suppliers.IgnoreQueryFilters().Where(x => x.TenantId == tenant && x.DeletedAt != null).ToListAsync(ct));
        return Ok(await PurgeAsync(records, ct));
    }

    /// <summary>
    /// Deletes for good, one at a time so one record that is still in use does not keep the
    /// rest. The database's own rules (cascades, refusals) decide what goes with it.
    /// </summary>
    private async Task<TrashEmptyResultDto> PurgeAsync(List<ISoftDeletable> records, CancellationToken ct)
    {
        db.HardDelete = true;
        var deleted = 0;
        var problems = new List<string>();
        foreach (var record in records)
        {
            db.Remove(record);
            try
            {
                await db.SaveChangesAsync(ct);
                deleted++;
            }
            catch (DbUpdateException)
            {
                db.Entry(record).State = EntityState.Unchanged;
                problems.Add($"« {Describe(record)} » est encore utilisé ailleurs et reste dans la corbeille.");
            }
        }
        db.HardDelete = false;
        return new TrashEmptyResultDto(deleted, problems.Count, problems);
    }

    private static string Describe(ISoftDeletable record) => record switch
    {
        Client c => c.Name,
        Project p => $"P-{p.Number:0000}",
        Quote q => $"S-{q.Number:0000}",
        Invoice i => i.Number,
        Product p => p.Title,
        Domain.Equipment e => e.Name,
        Supplier s => s.Name,
        _ => "élément"
    };

    private async Task<ISoftDeletable?> FindAsync(string type, Guid id, CancellationToken ct)
    {
        var tenant = TenantId;
        return type switch
        {
            "client" => await db.Clients.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant && x.DeletedAt != null, ct),
            "projet" => await db.Projects.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant && x.DeletedAt != null, ct),
            "soumission" => await db.Quotes.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant && x.DeletedAt != null, ct),
            "facture" => await db.Invoices.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant && x.DeletedAt != null, ct),
            "produit" => await db.Products.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant && x.DeletedAt != null, ct),
            "equipement" => await db.Equipment.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant && x.DeletedAt != null, ct),
            "fournisseur" => await db.Suppliers.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant && x.DeletedAt != null, ct),
            _ => null
        };
    }

    private static TrashItemDto Item(
        string type, Guid id, string title, string? subtitle, DateTimeOffset deletedAt, Guid? deletedBy,
        params (string Label, string? Value)[] fields) =>
        new(type, id, title, subtitle, deletedAt, deletedBy?.ToString(),
            [.. fields.Where(f => !string.IsNullOrWhiteSpace(f.Value)).Select(f => new TrashFieldDto(f.Label, f.Value!))]);
}
