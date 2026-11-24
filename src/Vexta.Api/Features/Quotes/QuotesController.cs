using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Projects;

namespace Vexta.Api.Features.Quotes;

/// <summary>
/// Soumissions: the prices given before any work is done, and what became of them.
///
/// Staff only, read and write. A customer will read their own quotes from their portal one day;
/// until that screen exists, opening the API to them would only be a door with nothing behind it.
/// </summary>
[ApiController]
[Route("api/soumissions")]
[Authorize(Roles = Roles.Staff)]
[RequireActiveSubscription]
public class QuotesController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    private const string Locked = "Cette soumission est devenue un projet : ses prix ne changent plus.";

    [HttpGet]
    public async Task<ActionResult<PagedResult<QuoteDto>>> List(
        [FromQuery] PagingQuery query, [FromQuery] Guid? clientId, [FromQuery] QuoteStatus? status,
        [FromQuery] Guid? clientAssetId)
    {
        var quotes = db.Quotes.AsNoTracking().AsQueryable();
        if (clientId is not null) quotes = quotes.Where(q => q.ClientId == clientId);
        if (status is not null) quotes = quotes.Where(q => q.Status == status);
        if (clientAssetId is not null) quotes = quotes.Where(q => q.ClientAssetId == clientAssetId);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Who it is for, the client's PO, what it is, or its number typed as 12 or S-0012.
            var search = query.Search.Trim();
            var pattern = $"%{search}%";
            var digits = new string(search.Where(char.IsDigit).ToArray());
            var number = int.TryParse(digits, out var parsed) ? parsed : (int?)null;

            quotes = quotes.Where(q =>
                EF.Functions.ILike(q.Client!.Name, pattern)
                || (q.PoNumber != null && EF.Functions.ILike(q.PoNumber, pattern))
                || (q.Description != null && EF.Functions.ILike(q.Description, pattern))
                || (number != null && q.Number == number));
        }

        var totalCount = await quotes.CountAsync();
        var items = await quotes
            .OrderByDescending(q => q.Number)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(ToDto())
            .ToListAsync();

        return Ok(new PagedResult<QuoteDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<QuoteDto>> Get(Guid id)
    {
        var quote = await GetDtoAsync(id);
        return quote is null ? NotFound() : Ok(quote);
    }

    /// <summary>
    /// The quote's cost table, in the same shape as a project's so the same table draws both:
    /// labour, materials and extra charges, what each costs, what each sells for, and the taxes.
    /// </summary>
    [HttpGet("{id:guid}/sommaire")]
    public async Task<ActionResult<QuoteSummaryDto>> Summary(Guid id)
    {
        var quote = await db.Quotes.AsNoTracking().Include(q => q.Lines).FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null) return NotFound();

        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == currentUser.TenantId);

        ProjectCostLineDto Line(QuoteLineKind kind, string key, string label)
        {
            var lines = quote.Lines.Where(l => l.Kind == kind).ToList();
            return new ProjectCostLineDto(key, label,
                Round(lines.Sum(l => l.Quantity * (l.UnitCost ?? 0m))),
                Round(lines.Sum(l => LineTotal(l))));
        }

        var rows = new List<ProjectCostLineDto>
        {
            Line(QuoteLineKind.Tache, "main-oeuvre", "Main-d'œuvre"),
            Line(QuoteLineKind.Materiel, "materiaux", "Matériaux"),
            Line(QuoteLineKind.Frais, "frais-supplementaires", "Frais supplémentaires"),
        };

        var totalCost = Round(rows.Sum(r => r.Cost));
        var subtotal = Round(rows.Sum(r => r.Revenue));
        var gstRate = quote.IsTaxExempt ? 0m : settings?.GstRate ?? 0m;
        var qstRate = quote.IsTaxExempt ? 0m : settings?.QstRate ?? 0m;
        var tax1 = Round(subtotal * gstRate / 100m);
        var tax2 = Round(subtotal * qstRate / 100m);

        var costs = new ProjectCostTableDto(
            rows, totalCost, subtotal, Round(subtotal - totalCost),
            TaxLabel("TPS", settings?.GstRate ?? 0m), tax1,
            TaxLabel("TVQ", settings?.QstRate ?? 0m), tax2,
            Round(subtotal + tax1 + tax2), quote.IsTaxExempt);

        return Ok(new QuoteSummaryDto(
            quote.Lines.Count(l => l.Kind == QuoteLineKind.Tache),
            quote.Lines.Count(l => l.Kind == QuoteLineKind.Materiel),
            quote.Lines.Count(l => l.Kind == QuoteLineKind.Frais),
            costs));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<QuoteDto>> Create(UpsertQuoteRequest request)
    {
        var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == request.ClientId);
        if (client is null) return BadRequest(new { message = "Client introuvable." });
        if (client.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });
        if (await InvalidAsync(request) is { } problem) return BadRequest(new { message = problem });
        if (request.Status == QuoteStatus.Acceptee)
            return BadRequest(new { message = "Une soumission est acceptée en la convertissant en projet." });

        var tenantId = currentUser.TenantId!.Value;
        var quote = new Quote
        {
            TenantId = tenantId,
            Number = await NextNumberAsync(tenantId),
            ClientId = request.ClientId,
            IsTaxExempt = request.IsTaxExempt ?? client.IsTaxExempt,
        };
        Apply(quote, request);

        db.Quotes.Add(quote);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = quote.Id }, await GetDtoAsync(quote.Id));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    public async Task<ActionResult<QuoteDto>> Update(Guid id, UpsertQuoteRequest request)
    {
        var quote = await db.Quotes.FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null) return NotFound();

        // Once it is a project, the price is the project's. The words can still be corrected;
        // the client, the tax answer and the status cannot.
        if (quote.ProjectId is not null
            && (quote.ClientId != request.ClientId
                || quote.IsTaxExempt != (request.IsTaxExempt ?? quote.IsTaxExempt)
                || request.Status != quote.Status))
        {
            return BadRequest(new { message = Locked });
        }

        if (quote.ProjectId is null && request.Status == QuoteStatus.Acceptee)
            return BadRequest(new { message = "Une soumission est acceptée en la convertissant en projet." });

        if (await InvalidAsync(request) is { } problem) return BadRequest(new { message = problem });

        quote.ClientId = request.ClientId;
        quote.IsTaxExempt = request.IsTaxExempt ?? quote.IsTaxExempt;
        Apply(quote, request);
        quote.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    public async Task<IActionResult> Delete(Guid id)
    {
        var quote = await db.Quotes.FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null) return NotFound();

        db.Quotes.Remove(quote);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ---- Lines ----

    [HttpGet("{id:guid}/lignes")]
    public async Task<ActionResult<List<QuoteLineDto>>> Lines(Guid id, [FromQuery] QuoteLineKind? kind)
    {
        if (!await db.Quotes.AnyAsync(q => q.Id == id)) return NotFound();

        var query = db.QuoteLines.AsNoTracking().Where(l => l.QuoteId == id);
        if (kind is not null) query = query.Where(l => l.Kind == kind);

        var lines = await query.OrderBy(l => l.Kind).ThenBy(l => l.SortOrder).ThenBy(l => l.CreatedAt).ToListAsync();
        return Ok(lines.Select(MapLine).ToList());
    }

    [HttpPost("{id:guid}/lignes")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    public async Task<ActionResult<QuoteLineDto>> AddLine(Guid id, SaveQuoteLineRequest request)
    {
        var quote = await db.Quotes.FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null) return NotFound();
        if (quote.ProjectId is not null) return BadRequest(new { message = Locked });
        if (await InvalidLineAsync(request) is { } problem) return BadRequest(new { message = problem });

        var next = await db.QuoteLines.Where(l => l.QuoteId == id && l.Kind == request.Kind)
            .MaxAsync(l => (int?)l.SortOrder) ?? -1;

        var line = new QuoteLine
        {
            TenantId = quote.TenantId,
            QuoteId = id,
            Kind = request.Kind,
            Description = request.Description.Trim(),
            SortOrder = next + 1,
        };
        ApplyLine(line, request);
        quote.UpdatedAt = DateTimeOffset.UtcNow;

        db.QuoteLines.Add(line);
        await db.SaveChangesAsync();
        return Ok(MapLine(line));
    }

    [HttpPut("{id:guid}/lignes/{lineId:guid}")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    public async Task<ActionResult<QuoteLineDto>> UpdateLine(Guid id, Guid lineId, SaveQuoteLineRequest request)
    {
        var line = await db.QuoteLines.Include(l => l.Quote).FirstOrDefaultAsync(l => l.Id == lineId && l.QuoteId == id);
        if (line is null) return NotFound();
        if (line.Quote!.ProjectId is not null) return BadRequest(new { message = Locked });
        if (await InvalidLineAsync(request) is { } problem) return BadRequest(new { message = problem });

        ApplyLine(line, request);
        line.UpdatedAt = DateTimeOffset.UtcNow;
        line.Quote.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Ok(MapLine(line));
    }

    [HttpDelete("{id:guid}/lignes/{lineId:guid}")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    public async Task<IActionResult> DeleteLine(Guid id, Guid lineId)
    {
        var line = await db.QuoteLines.Include(l => l.Quote).FirstOrDefaultAsync(l => l.Id == lineId && l.QuoteId == id);
        if (line is null) return NotFound();
        if (line.Quote!.ProjectId is not null) return BadRequest(new { message = Locked });

        db.QuoteLines.Remove(line);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ---- Acceptance ----

    /// <summary>
    /// Turns the quote into a project: the same client, addresses, asset and filing, the
    /// subtotal as the budget, every labour line as a task with its hours as the estimate,
    /// every material and extra charge at the price quoted. Done once; the quote then points at
    /// its project and stops changing.
    /// </summary>
    [HttpPost("{id:guid}/convertir")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<QuoteDto>> Convert(Guid id)
    {
        var quote = await db.Quotes.Include(q => q.Lines).Include(q => q.Client).FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null) return NotFound();
        if (quote.ProjectId is not null) return BadRequest(new { message = "Cette soumission est déjà devenue un projet." });
        if (quote.Status is QuoteStatus.Refusee or QuoteStatus.Expiree)
            return BadRequest(new { message = "Une soumission refusée ou expirée ne devient pas un projet. Remettez-la en brouillon d'abord." });
        if (quote.Client!.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });

        var tenantId = quote.TenantId;
        var highest = await db.Projects.IgnoreQueryFilters()
            .Where(p => p.TenantId == tenantId)
            .MaxAsync(p => (int?)p.Number) ?? 0;

        var ordered = quote.Lines.OrderBy(l => l.SortOrder).ThenBy(l => l.CreatedAt).ToList();
        var project = new Project
        {
            TenantId = tenantId,
            Number = highest + 1,
            ClientId = quote.ClientId,
            PoNumber = quote.PoNumber,
            Description = quote.Description,
            StartDate = quote.StartDate,
            EndDate = quote.EndDate,
            Budget = Round(ordered.Sum(LineTotal)),
            IsTaxExempt = quote.IsTaxExempt,
            ClientAssetId = quote.ClientAssetId,
            ClientAddressId = quote.ClientAddressId,
            SameAddressAsClient = quote.SameAddressAsClient,
            SiteAddressId = quote.SameAddressAsClient ? null : quote.SiteAddressId,
            CategoryId = quote.CategoryId,
            SubCategoryId = quote.SubCategoryId,
            WageClassificationId = quote.WageClassificationId,
        };

        var order = 0;
        foreach (var line in ordered.Where(l => l.Kind == QuoteLineKind.Tache))
        {
            project.Tasks.Add(new ProjectTask
            {
                TenantId = tenantId,
                Title = Truncate(line.Description, 200),
                EstimatedHours = line.Quantity,
                SortOrder = order++,
            });
        }

        order = 0;
        foreach (var line in ordered.Where(l => l.Kind == QuoteLineKind.Materiel))
        {
            project.Materials.Add(new ProjectMaterial
            {
                TenantId = tenantId,
                ProductId = line.ProductId,
                Code = line.Code,
                Description = line.Description,
                Unit = line.Unit,
                Quantity = line.Quantity,
                PurchasePrice = line.UnitCost,
                UnitPrice = line.UnitPrice,
                SortOrder = order++,
            });
        }

        foreach (var line in ordered.Where(l => l.Kind == QuoteLineKind.Frais))
        {
            project.ExtraCharges.Add(new ProjectExtraCharge
            {
                TenantId = tenantId,
                Name = Truncate(line.Description, 200),
                Cost = line.UnitCost is { } cost ? Round(cost * line.Quantity) : null,
                SellingPrice = LineTotal(line),
            });
        }

        db.Projects.Add(project);
        quote.ProjectId = project.Id;
        quote.Status = QuoteStatus.Acceptee;
        quote.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    // ---- Helpers ----

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
    private static decimal LineTotal(QuoteLine line) => Round(line.Quantity * line.UnitPrice);
    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
    private static string TaxLabel(string name, decimal rate) =>
        $"{name} ({rate.ToString("0.###", Formats.Quebec)} %)";
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void Apply(Quote quote, UpsertQuoteRequest request)
    {
        quote.PoNumber = Clean(request.PoNumber);
        quote.Description = request.Description;
        quote.Status = request.Status;
        quote.IssuedOn = request.IssuedOn;
        quote.ValidUntil = request.ValidUntil;
        quote.StartDate = request.StartDate;
        quote.EndDate = request.EndDate;
        quote.ClientAssetId = request.ClientAssetId;
        quote.ClientAddressId = request.ClientAddressId;
        quote.SameAddressAsClient = request.SameAddressAsClient;
        quote.SiteAddressId = request.SameAddressAsClient ? null : request.SiteAddressId;
        quote.CategoryId = request.CategoryId;
        quote.SubCategoryId = request.CategoryId is null ? null : request.SubCategoryId;
        quote.WageClassificationId = request.WageClassificationId;
    }

    private static void ApplyLine(QuoteLine line, SaveQuoteLineRequest request)
    {
        line.Kind = request.Kind;
        line.Description = request.Description.Trim();
        line.Quantity = request.Quantity;
        line.UnitCost = request.UnitCost;
        line.UnitPrice = request.UnitPrice;
        line.ProductId = request.ProductId;
        line.Code = Clean(request.Code);
        line.Unit = Clean(request.Unit);
    }

    /// <summary>
    /// Every id from the browser has to be this client's own or this company's own — the same
    /// checks as a project, for the same reason: they are printed on what the client receives.
    /// </summary>
    private async Task<string?> InvalidAsync(UpsertQuoteRequest request)
    {
        if (request.ValidUntil is { } until && request.IssuedOn is { } issued && until < issued)
            return "La date d'échéance précède la date de la soumission.";

        foreach (var addressId in new[] { request.ClientAddressId, request.SameAddressAsClient ? null : request.SiteAddressId })
        {
            if (addressId is not { } aid) continue;
            if (!await db.Addresses.AnyAsync(a => a.Id == aid && a.ClientId == request.ClientId))
                return "Cette adresse n'appartient pas à ce client.";
        }

        if (request.ClientAssetId is { } assetId
            && !await db.ClientAssets.AnyAsync(a => a.Id == assetId && a.ClientId == request.ClientId))
            return "Cet actif n'appartient pas à ce client.";

        if (request.CategoryId is { } categoryId && !await db.ProjectCategories.AnyAsync(c => c.Id == categoryId))
            return "Cette catégorie n'existe plus.";

        if (request.CategoryId is not null && request.SubCategoryId is { } subId
            && !await db.ProjectSubCategories.AnyAsync(s => s.Id == subId && s.CategoryId == request.CategoryId))
            return "Cette sous-catégorie n'appartient pas à la catégorie choisie.";

        if (request.WageClassificationId is { } classificationId
            && !await db.WageClassifications.AnyAsync(c => c.Id == classificationId))
            return "Ce classement n'existe plus.";

        return null;
    }

    private async Task<string?> InvalidLineAsync(SaveQuoteLineRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Description)) return "La description est requise.";
        if (request.Description.Trim().Length > 2000) return "La description est trop longue.";
        if (request.Quantity <= 0) return "La quantité doit être supérieure à zéro.";
        if (request.UnitPrice < 0 || request.UnitCost < 0) return "Un prix ne peut pas être négatif.";
        if (request.ProductId is { } productId && !await db.Products.AnyAsync(p => p.Id == productId))
            return "Ce produit n'existe plus.";
        return null;
    }

    private async Task<int> NextNumberAsync(Guid tenantId)
    {
        // Max + 1 across every row the company ever had, so a deleted quote's number is not
        // handed to the next one. The unique index turns a simultaneous creation into an error.
        var highest = await db.Quotes.IgnoreQueryFilters()
            .Where(q => q.TenantId == tenantId)
            .MaxAsync(q => (int?)q.Number) ?? 0;
        return highest + 1;
    }

    private static QuoteLineDto MapLine(QuoteLine l) =>
        new(l.Id, l.Kind, l.ProductId, l.Code, l.Description, l.Unit, l.Quantity, l.UnitCost, l.UnitPrice,
            LineTotal(l), l.SortOrder);

    private Task<QuoteDto?> GetDtoAsync(Guid id) =>
        db.Quotes.AsNoTracking().Where(q => q.Id == id).Select(ToDto()).FirstOrDefaultAsync();

    private static System.Linq.Expressions.Expression<Func<Quote, QuoteDto>> ToDto() => q => new QuoteDto(
        q.Id,
        q.Number,
        q.ClientId,
        q.Client!.Name,
        q.PoNumber,
        q.Description,
        q.Status,
        q.IssuedOn,
        q.ValidUntil,
        q.StartDate,
        q.EndDate,
        q.IsTaxExempt,
        q.ClientAssetId,
        q.ClientAsset == null ? null : q.ClientAsset.Label,
        q.ClientAddress == null
            ? null
            : new ProjectAddressDto(q.ClientAddress.Id, q.ClientAddress.Line1, q.ClientAddress.Line2,
                q.ClientAddress.City, q.ClientAddress.Province, q.ClientAddress.PostalCode),
        q.SameAddressAsClient,
        q.SiteAddress == null
            ? null
            : new ProjectAddressDto(q.SiteAddress.Id, q.SiteAddress.Line1, q.SiteAddress.Line2,
                q.SiteAddress.City, q.SiteAddress.Province, q.SiteAddress.PostalCode),
        q.CategoryId,
        q.Category == null ? null : q.Category.Name,
        q.SubCategoryId,
        q.SubCategory == null ? null : q.SubCategory.Name,
        q.WageClassificationId,
        q.WageClassification == null ? null : q.WageClassification.Name,
        q.ProjectId,
        q.Project == null ? null : q.Project.Number,
        q.Lines.Sum(l => Math.Round(l.Quantity * l.UnitPrice, 2)),
        q.CreatedAt,
        q.UpdatedAt);
}
