using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Projects;

[ApiController]
[Route("api/projects")]
// Client is in the list because a customer reads their own projects and invoices here; the
// query filter is what confines them to their own, and [StaffOnly] on every write is what
// stops them changing anything.
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.TenantUser)},{nameof(UserRole.SuperAdmin)},{nameof(UserRole.Client)}")]
[RequireActiveSubscription]
public class ProjectsController(VextaDbContext db, ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<ProjectDto>>> List(
        [FromQuery] PagingQuery query, [FromQuery] Guid? clientId, [FromQuery] ProjectStatus? status)
    {
        var projects = db.Projects.AsNoTracking().AsQueryable();

        if (clientId is not null) projects = projects.Where(p => p.ClientId == clientId);
        if (status is not null) projects = projects.Where(p => p.Status == status);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // A project has no name to search, so what is left is who it is for, the client's
            // own PO, and its number — typed either as 12 or as P-0012, which is how it is read
            // off a document.
            var search = query.Search.Trim();

            // ILike, not Contains: Contains becomes a case-sensitive LIKE on Postgres, and
            // nobody searches in the case the record was typed in.
            var pattern = $"%{search}%";
            var digits = new string(search.Where(char.IsDigit).ToArray());
            var number = int.TryParse(digits, out var parsed) ? parsed : (int?)null;

            projects = projects.Where(p =>
                EF.Functions.ILike(p.Client!.Name, pattern)
                || (p.PoNumber != null && EF.Functions.ILike(p.PoNumber, pattern))
                || (number != null && p.Number == number));
        }

        var totalCount = await projects.CountAsync();

        var items = await projects
            .OrderByDescending(p => p.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(ToDto())
            .ToListAsync();

        return Ok(new PagedResult<ProjectDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectDto>> Get(Guid id)
    {
        var project = await GetDtoAsync(id);
        return project is null ? NotFound() : Ok(project);
    }

    /// <summary>
    /// What the project's own page needs around the record: how many rows sit in each section,
    /// and the money. One request, because both are drawn at once and a page that fills in six
    /// badges one at a time reads as broken.
    /// </summary>
    // StaffOnly, unlike the record itself: what a job cost the company and what it makes on it
    // is not the customer's to read, and this is the one endpoint that says both.
    [HttpGet("{id:guid}/summary")]
    [StaffOnly]
    public async Task<ActionResult<ProjectSummaryDto>> Summary(Guid id)
    {
        var project = await db.Projects.AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new
            {
                p.Id,
                p.IsTaxExempt,
                Invoices = p.Invoices.Count,
                Expenses = p.Expenses.Count,
                Materials = p.Materials.Count,
                Timesheets = p.Timesheets.Count,
                Documents = p.Documents.Count,
                Notes = p.Notes.Count
            })
            .FirstOrDefaultAsync();

        if (project is null) return NotFound();

        var expenses = await db.ProjectExpenses.AsNoTracking()
            .Where(x => x.ProjectId == id)
            .Select(x => new { x.Cost, x.SellingPrice })
            .ToListAsync();

        var materials = await db.ProjectMaterials.AsNoTracking()
            .Where(m => m.ProjectId == id)
            .Select(m => new { m.Quantity, m.PurchasePrice, m.UnitPrice })
            .ToListAsync();

        var hours = await db.TimesheetEntries.AsNoTracking()
            .Where(t => t.ProjectId == id)
            .SumAsync(t => (decimal?)t.Hours) ?? 0m;

        // The sections that have no records of their own yet count zero rather than being left
        // out: the badge is what will show them filling up, and a section that appears only
        // once it has content is a section nobody discovers.
        var counts = new ProjectSectionCountsDto(
            Materials: project.Materials,
            Equipment: 0,
            Assemblies: 0,
            Timesheets: project.Timesheets,
            Expenses: project.Expenses,
            ExtraCharges: 0,
            DocumentsAndNotes: project.Documents + project.Notes,
            Invoices: project.Invoices);

        var settings = await db.BillingSettings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == currentUser.TenantId);

        // Hours are revenue and no cost: what the company charges for an hour is settled, what
        // an hour of that person's time costs it is payroll, which this application does not
        // know. A guessed wage here would turn the profit column into fiction.
        var labourRevenue = hours * (settings?.DefaultHourlyRate ?? 0m);

        var lines = new List<ProjectCostLineDto>
        {
            new("materiaux", "Matériaux",
                materials.Sum(m => m.Quantity * (m.PurchasePrice ?? 0m)),
                materials.Sum(m => m.Quantity * m.UnitPrice)),
            new("equipements", "Équipements", 0m, 0m),
            new("assemblages", "Assemblages", 0m, 0m),
            new("feuilles-de-temps", "Feuilles de temps", 0m, labourRevenue),
            new("depenses", "Dépenses",
                expenses.Sum(x => x.Cost ?? 0m),
                expenses.Sum(x => x.SellingPrice ?? 0m)),
            new("frais-supplementaires", "Frais supplémentaires", 0m, 0m)
        };

        var totalCost = Round(lines.Sum(l => l.Cost));
        var subtotal = Round(lines.Sum(l => l.Revenue));

        // Zero on an exempt project, and the rates are still named: the table has to show that
        // no tax was charged on purpose, not that the settings are missing.
        var gstRate = project.IsTaxExempt ? 0m : settings?.GstRate ?? 0m;
        var qstRate = project.IsTaxExempt ? 0m : settings?.QstRate ?? 0m;

        var tax1 = Round(subtotal * gstRate / 100m);
        var tax2 = Round(subtotal * qstRate / 100m);

        var costs = new ProjectCostTableDto(
            lines,
            totalCost,
            subtotal,
            Round(subtotal - totalCost),
            TaxLabel("TPS", settings?.GstRate ?? 0m),
            tax1,
            TaxLabel("TVQ", settings?.QstRate ?? 0m),
            tax2,
            Round(subtotal + tax1 + tax2),
            project.IsTaxExempt);

        return Ok(new ProjectSummaryDto(counts, costs));
    }

    private static string TaxLabel(string name, decimal rate) =>
        $"{name} ({rate.ToString("0.###", Formats.Quebec)} %)";

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    // Reading is open to the customer this record belongs to — the query filter already
    // narrows it to theirs. Writing is not: a client does not raise their own invoice, and
    // "they can only see their own" is not the same promise as "they can change it".
    [HttpPost]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<ProjectDto>> Create(UpsertProjectRequest request)
    {
        var client = await db.Clients.AsNoTracking()
            .Where(c => c.Id == request.ClientId)
            .Select(c => new { c.IsTaxExempt })
            .FirstOrDefaultAsync();
        if (client is null) return BadRequest(new { message = "Client introuvable." });
        if (await InvalidAddressesAsync(request) is { } addressError) return BadRequest(new { message = addressError });

        var tenantId = currentUser.TenantId!.Value;
        var project = new Project
        {
            TenantId = tenantId,
            Number = await NextNumberAsync(tenantId),
            ClientId = request.ClientId,
            PoNumber = Clean(request.PoNumber),
            Description = request.Description,
            Status = request.Status,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Budget = request.Budget,
            // The client's answer is the starting point, not the rule: a tax-exempt client can
            // still have a job that does not qualify, so the project owns the flag from here on.
            IsTaxExempt = request.IsTaxExempt ?? client.IsTaxExempt,
            PricePolicyId = request.PricePolicyId
        };

        ApplyAddresses(project, request);
        db.Projects.Add(project);
        await db.SaveChangesAsync();

        var dto = await GetDtoAsync(project.Id);
        return CreatedAtAction(nameof(Get), new { id = project.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    [StaffOnly]
    public async Task<ActionResult<ProjectDto>> Update(Guid id, UpsertProjectRequest request)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return NotFound();

        // A billed job is frozen on money. A typo in the description or a late PO number can
        // still be fixed; the budget, the tax answer and the price policy cannot, because those
        // are the figures the invoice in the client's hands was built from.
        if (ProjectLock.IsBilled(project.Status) && ChangesAmounts(project, request))
        {
            return BadRequest(new { message = ProjectLock.Problem(project.Status) });
        }

        if (await InvalidAddressesAsync(request) is { } addressError) return BadRequest(new { message = addressError });

        project.ClientId = request.ClientId;
        project.PoNumber = Clean(request.PoNumber);
        project.Description = request.Description;
        project.Status = request.Status;
        project.StartDate = request.StartDate;
        project.EndDate = request.EndDate;
        project.Budget = request.Budget;
        project.IsTaxExempt = request.IsTaxExempt ?? project.IsTaxExempt;
        project.PricePolicyId = request.PricePolicyId;
        project.UpdatedAt = DateTimeOffset.UtcNow;

        ApplyAddresses(project, request);

        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    [HttpDelete("{id:guid}")]
    [StaffOnly]
    public async Task<IActionResult> Delete(Guid id)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return NotFound();

        // Deleting a billed job would leave its invoice pointing at nothing, and that invoice
        // is the one document the client has.
        if (ProjectLock.Problem(project.Status) is { } locked) return BadRequest(new { message = locked });

        db.Projects.Remove(project);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// True when the request would move one of the figures a sent invoice was built from.
    ///
    /// Compared field by field rather than trusted from a flag, because the browser posts the
    /// whole record on every save: a form that only moved the status still sends the other
    /// fifteen fields, and refusing that save would lock the office out of reopening the job.
    ///
    /// The dates, the description, the PO number and the addresses are deliberately absent —
    /// none of them changes a total, and a billed job still gets corrected. The client is here
    /// all the same: a job that has been billed cannot change whose bill it is.
    /// </summary>
    private static bool ChangesAmounts(Project project, UpsertProjectRequest request) =>
        project.ClientId != request.ClientId
        || project.Budget != request.Budget
        || project.IsTaxExempt != (request.IsTaxExempt ?? project.IsTaxExempt)
        || project.PricePolicyId != request.PricePolicyId;

    /// <summary>
    /// Max + 1, not count + 1: deleting a project must not hand its number to the next one.
    /// The unique index is what makes a simultaneous creation fail rather than collide silently.
    /// </summary>
    private async Task<int> NextNumberAsync(Guid tenantId)
    {
        var highest = await db.Projects.IgnoreQueryFilters()
            .Where(p => p.TenantId == tenantId)
            .MaxAsync(p => (int?)p.Number) ?? 0;

        return highest + 1;
    }

    /// <summary>
    /// Both addresses have to belong to the client being billed. Checked rather than trusted:
    /// the ids come from the browser, and one pointing at another client's address would print
    /// that client's street on this one's invoice.
    /// </summary>
    private async Task<string?> InvalidAddressesAsync(UpsertProjectRequest request)
    {
        foreach (var addressId in new[] { request.ClientAddressId, request.SameAddressAsClient ? null : request.SiteAddressId })
        {
            if (addressId is not { } id) continue;
            if (!await db.Addresses.AnyAsync(a => a.Id == id && a.ClientId == request.ClientId))
            {
                return "Cette adresse n'appartient pas à ce client.";
            }
        }

        return null;
    }

    /// <summary>
    /// When the site is the billing address, the site address is cleared rather than copied.
    /// A copy would go stale the moment the client's address changes, and nothing would say so.
    /// </summary>
    private static void ApplyAddresses(Project project, UpsertProjectRequest request)
    {
        project.ClientAddressId = request.ClientAddressId;
        project.SameAddressAsClient = request.SameAddressAsClient;
        project.SiteAddressId = request.SameAddressAsClient ? null : request.SiteAddressId;
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private Task<ProjectDto?> GetDtoAsync(Guid id) =>
        db.Projects.AsNoTracking().Where(p => p.Id == id).Select(ToDto()).FirstOrDefaultAsync();

    private static System.Linq.Expressions.Expression<Func<Project, ProjectDto>> ToDto() => p => new ProjectDto(
        p.Id,
        p.Number,
        p.ClientId,
        p.Client!.Name,
        p.PoNumber,
        p.Description,
        p.Status,
        p.StartDate,
        p.EndDate,
        p.Budget,
        p.IsTaxExempt,
        p.PricePolicyId,
        p.PricePolicy!.Name,
        p.ClientAddress == null
            ? null
            : new ProjectAddressDto(p.ClientAddress.Id, p.ClientAddress.Line1, p.ClientAddress.Line2,
                p.ClientAddress.City, p.ClientAddress.Province, p.ClientAddress.PostalCode),
        p.SameAddressAsClient,
        p.SiteAddress == null
            ? null
            : new ProjectAddressDto(p.SiteAddress.Id, p.SiteAddress.Line1, p.SiteAddress.Line2,
                p.SiteAddress.City, p.SiteAddress.Province, p.SiteAddress.PostalCode),
        p.Invoices.Count,
        p.CreatedAt,
        p.UpdatedAt);
}
