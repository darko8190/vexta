using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// The expenses filed against one project.
///
/// Staff only, including for reading: an expense carries what the company paid and what it
/// charges for it, and a customer with access to their own project has no business seeing the
/// margin on it. That is a different promise from the project record, which they do read.
/// </summary>
[ApiController]
[Route("api/projects/{projectId:guid}/expenses")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ProjectExpensesController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IR2StorageService storage,
    IReceiptScanner receipts) : ControllerBase
{
    /// <summary>
    /// Whether to offer the "lire le reçu" button, asked when the panel opens.
    ///
    /// Its own call rather than a flag on the expense list: the answer changes as scans are
    /// spent, and it is about the company and the platform rather than about this project.
    /// </summary>
    [HttpGet("lecture-recu")]
    public async Task<ActionResult<ReceiptScanAvailabilityDto>> ScanAvailability(CancellationToken ct)
    {
        var state = await receipts.AvailabilityAsync(ct);
        return Ok(new ReceiptScanAvailabilityDto(state.Available, state.Remaining, state.Allowance));
    }

    /// <summary>
    /// Reads a receipt already attached to this expense and hands the figures back to the form.
    ///
    /// Saves nothing. The person sees what was read, in the fields they were about to type, and
    /// decides — because a receipt read wrong and filed silently ends up on a client's invoice,
    /// and it is the company that answers the telephone about it.
    ///
    /// Always 200, even when nothing could be read: the message is part of the answer, and a
    /// 400 in front of somebody holding a receipt is a dead end rather than an instruction.
    /// </summary>
    [HttpPost("lecture-recu")]
    [RequireBusinessTenant]
    public async Task<ActionResult<ReceiptReadingDto>> ReadReceipt(
        Guid projectId, ReadReceiptRequest request, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        var result = await receipts.ReadAsync(request.MediaAssetId, ct);

        return Ok(new ReceiptReadingDto(
            Found: result.Reading is not null,
            Message: result.Message,
            Remaining: result.Remaining,
            Supplier: result.Reading?.Supplier,
            Total: result.Reading?.Total,
            Gst: result.Reading?.Gst,
            Qst: result.Reading?.Qst,
            SpentOn: result.Reading?.SpentOn,
            InvoiceNumber: result.Reading?.InvoiceNumber));
    }

    [HttpGet]
    public async Task<ActionResult<List<ProjectExpenseDto>>> List(Guid projectId, CancellationToken ct)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, ct)) return NotFound();

        var items = await db.ProjectExpenses.AsNoTracking()
            .Where(x => x.ProjectId == projectId)
            .OrderByDescending(x => x.SpentOn)
            .ThenByDescending(x => x.CreatedAt)
            .Select(ToDto())
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectExpenseDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var expense = await db.ProjectExpenses.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(ToDto())
            .FirstOrDefaultAsync(ct);

        if (expense is null) return NotFound();

        return Ok(new ProjectExpenseDetailDto(expense, await PhotosAsync(id, ct)));
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectExpenseDetailDto>> Create(
        Guid projectId, SaveProjectExpenseRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var status = await db.Projects.Where(p => p.Id == projectId)
            .Select(p => (ProjectStatus?)p.Status).FirstOrDefaultAsync(ct);
        if (status is null) return NotFound();

        // A billed job takes no new expenses: it would be a cost nobody charged for.
        if (ProjectLock.Problem(status.Value) is { } locked) return BadRequest(new { message = locked });

        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        if (!await db.ExpenseTypes.AnyAsync(t => t.Id == request.ExpenseTypeId, ct))
        {
            return BadRequest(new { message = "Ce type de dépense n'existe pas." });
        }

        if (await ProjectTaskLink.ProblemAsync(db, projectId, request.ProjectTaskId, ct) is { } wrongTask)
        {
            return BadRequest(new { message = wrongTask });
        }

        var expense = new ProjectExpense
        {
            TenantId = tenantId,
            ProjectId = projectId,
            CreatedByUserId = currentUser.UserId,
            Name = request.Name.Trim(),
            Description = Clean(request.Description),
            ExpenseTypeId = request.ExpenseTypeId,
            Cost = request.Cost,
            SellingPrice = request.SellingPrice,
            SpentOn = request.SpentOn,
            ProjectTaskId = request.ProjectTaskId,
            IsBillable = request.IsBillable ?? true
        };

        db.ProjectExpenses.Add(expense);

        if (await ApplyPhotosAsync(expense, request.MediaAssetIds, tenantId, ct) is { } photoProblem)
        {
            return BadRequest(new { message = photoProblem });
        }

        await db.SaveChangesAsync(ct);
        return await Get(expense.Id, ct);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProjectExpenseDetailDto>> Update(
        Guid id, SaveProjectExpenseRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var expense = await db.ProjectExpenses.Include(x => x.Photos).Include(x => x.Project)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (expense is null) return NotFound();

        if (expense.Project is { } owner && ProjectLock.Problem(owner.Status) is { } locked)
        {
            return BadRequest(new { message = locked });
        }

        if (Problem(request) is { } problem) return BadRequest(new { message = problem });
        if (!await db.ExpenseTypes.AnyAsync(t => t.Id == request.ExpenseTypeId, ct))
        {
            return BadRequest(new { message = "Ce type de dépense n'existe pas." });
        }

        if (await ProjectTaskLink.ProblemAsync(db, expense.ProjectId, request.ProjectTaskId, ct) is { } wrongTask)
        {
            return BadRequest(new { message = wrongTask });
        }

        expense.Name = request.Name.Trim();
        expense.Description = Clean(request.Description);
        expense.ExpenseTypeId = request.ExpenseTypeId;
        expense.Cost = request.Cost;
        expense.SellingPrice = request.SellingPrice;
        expense.SpentOn = request.SpentOn;
        expense.ProjectTaskId = request.ProjectTaskId;
        expense.IsBillable = request.IsBillable ?? expense.IsBillable;
        expense.UpdatedAt = DateTimeOffset.UtcNow;

        db.ProjectExpensePhotos.RemoveRange(expense.Photos);
        expense.Photos.Clear();

        if (await ApplyPhotosAsync(expense, request.MediaAssetIds, tenantId, ct) is { } photoProblem)
        {
            return BadRequest(new { message = photoProblem });
        }

        await db.SaveChangesAsync(ct);
        return await Get(id, ct);
    }

    /// <summary>
    /// Moves the expense along — approved, paid back, refused — without touching its figures.
    /// The office's decision, so managers only; and allowed on a billed job, since it changes
    /// nothing the invoice was built from.
    /// </summary>
    [HttpPatch("{id:guid}/statut")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<ProjectExpenseDetailDto>> SetStatus(Guid id, SetExpenseStatusRequest request, CancellationToken ct)
    {
        if (!Enum.IsDefined(request.Status)) return BadRequest(new { message = "État inconnu." });
        var expense = await db.ProjectExpenses.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (expense is null) return NotFound();
        expense.Status = request.Status;
        expense.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return await Get(id, ct);
    }


    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var expense = await db.ProjectExpenses.Include(x => x.Project)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (expense is null) return NotFound();

        if (expense.Project is { } owner && ProjectLock.Problem(owner.Status) is { } locked)
        {
            return BadRequest(new { message = locked });
        }

        // The photo rows go with it; the files stay in the library. Deleting someone's uploads
        // out from under them is the library's decision to offer, not this one's to take.
        db.ProjectExpenses.Remove(expense);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Problem(SaveProjectExpenseRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Le nom de la dépense est obligatoire.";
        if (request.ExpenseTypeId == Guid.Empty) return "Choisissez un type de dépense.";
        if (request.Cost is < 0 || request.SellingPrice is < 0)
        {
            return "Un montant ne peut pas être négatif.";
        }

        return null;
    }

    /// <summary>
    /// Attaches the uploaded files in the order given. The ids are checked against this tenant's
    /// own library — the query filter is what makes a foreign id simply not exist here, rather
    /// than something that can be pinned to an expense and then read through it.
    /// </summary>
    private async Task<string?> ApplyPhotosAsync(
        ProjectExpense expense, IReadOnlyList<Guid>? mediaAssetIds, Guid tenantId, CancellationToken ct)
    {
        if (mediaAssetIds is null || mediaAssetIds.Count == 0) return null;

        var ids = mediaAssetIds.Distinct().ToList();
        var known = await db.MediaAssets.AsNoTracking()
            .Where(m => ids.Contains(m.Id))
            .Select(m => m.Id)
            .ToListAsync(ct);

        if (known.Count != ids.Count) return "Une des photos téléversées est introuvable.";

        // Added through the DbSet rather than onto the expense's collection, which looks like a
        // detail and is not: these rows carry a client-generated Guid key, and EF reads a key
        // that is already set as "this row exists". Reached through a navigation on an expense
        // being edited it was marked Modified instead of Added, so the save issued an UPDATE
        // for a photo that had never been inserted and failed on nought rows affected.
        db.ProjectExpensePhotos.AddRange(ids.Select((assetId, index) => new ProjectExpensePhoto
        {
            TenantId = tenantId,
            ExpenseId = expense.Id,
            MediaAssetId = assetId,
            SortOrder = index
        }));

        return null;
    }

    /// <summary>
    /// The photographs with a link each. A link that cannot be signed comes back null rather
    /// than failing the request: the expense and its amounts are still worth showing when the
    /// file storage is unreachable or has never been configured.
    /// </summary>
    private async Task<List<ExpensePhotoDto>> PhotosAsync(Guid expenseId, CancellationToken ct)
    {
        var rows = await db.ProjectExpensePhotos.AsNoTracking()
            .Where(p => p.ExpenseId == expenseId)
            .OrderBy(p => p.SortOrder)
            .Select(p => new
            {
                p.Id,
                p.MediaAssetId,
                p.SortOrder,
                p.MediaAsset!.FileName,
                p.MediaAsset!.ContentType,
                p.MediaAsset!.ObjectKey
            })
            .ToListAsync(ct);

        var photos = new List<ExpensePhotoDto>(rows.Count);

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
                // page, not once per photograph.
            }

            photos.Add(new ExpensePhotoDto(
                row.Id, row.MediaAssetId, row.FileName, row.ContentType, url, row.SortOrder));
        }

        return photos;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static System.Linq.Expressions.Expression<Func<ProjectExpense, ProjectExpenseDto>> ToDto() =>
        x => new ProjectExpenseDto(
            x.Id,
            x.ProjectId,
            x.Name,
            x.Description,
            x.ExpenseTypeId,
            x.ExpenseType!.Name,
            x.Cost,
            x.SellingPrice,
            x.SpentOn,
            x.Photos.Count,
            x.ProjectTaskId,
            x.ProjectTask == null ? null : x.ProjectTask.Title,
            x.CreatedAt,
            x.UpdatedAt,
            x.Status,
            x.Project!.Number,
            x.Project!.Client!.Name,
            x.IsBillable);
}

/// <summary>
/// The company's expense categories. Separate from the project because the list is the
/// company's, and it is added to from the dropdown of whichever expense is being filed.
/// </summary>
[ApiController]
[Route("api/expense-types")]
[StaffOnly]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class ExpenseTypesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ExpenseTypeDto>>> List(CancellationToken ct)
    {
        var items = await db.ExpenseTypes.AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new ExpenseTypeDto(t.Id, t.Name, t.Expenses.Count))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<ExpenseTypeDto>> Create(SaveExpenseTypeRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { message = "Le nom du type est obligatoire." });
        if (name.Length > 100) return BadRequest(new { message = "Le nom du type est trop long." });

        // Returned rather than refused: someone typing a category that already exists meant to
        // use that one, and an error here would send them hunting through a list for it.
        var existing = await db.ExpenseTypes.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Name.ToLower() == name.ToLower(), ct);

        if (existing is not null)
        {
            return Ok(new ExpenseTypeDto(existing.Id, existing.Name, 0));
        }

        var type = new ExpenseType { TenantId = tenantId, Name = name };
        db.ExpenseTypes.Add(type);
        await db.SaveChangesAsync(ct);

        return Ok(new ExpenseTypeDto(type.Id, type.Name, 0));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ExpenseTypeDto>> Update(Guid id, SaveExpenseTypeRequest request, CancellationToken ct)
    {
        var type = await db.ExpenseTypes.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (type is null) return NotFound();

        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { message = "Le nom du type est obligatoire." });
        if (name.Length > 100) return BadRequest(new { message = "Le nom du type est trop long." });

        if (await db.ExpenseTypes.AnyAsync(t => t.Id != id && t.Name.ToLower() == name.ToLower(), ct))
        {
            return Conflict(new { message = "Un type porte déjà ce nom." });
        }

        type.Name = name;
        await db.SaveChangesAsync(ct);

        return Ok(new ExpenseTypeDto(type.Id, type.Name, await db.ProjectExpenses.CountAsync(x => x.ExpenseTypeId == id, ct)));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var type = await db.ExpenseTypes.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (type is null) return NotFound();

        // Refused with the count rather than cascading: the expenses would lose the one field
        // that says what they were, and nobody would be able to put it back.
        var inUse = await db.ProjectExpenses.CountAsync(x => x.ExpenseTypeId == id, ct);
        if (inUse > 0)
        {
            return Conflict(new
            {
                message = inUse == 1
                    ? "Une dépense utilise ce type. Changez-la d'abord."
                    : $"{inUse} dépenses utilisent ce type. Changez-les d'abord."
            });
        }

        db.ExpenseTypes.Remove(type);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
