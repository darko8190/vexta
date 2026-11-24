using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Features.Projects;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Quotes;

/// <summary>
/// Soumissions: the prices given before any work is done, and what became of them.
///
/// Staff read and write. A customer reads their own from their portal — the query filter keeps
/// them to their client's rows, and drafts are withheld here, because a price still being worked
/// out is not a price given. The customer's only writes are Accepter and Refuser; every other
/// write carries [StaffOnly], and so do the lines and the cost table, which show what the work
/// costs the company and not only what it sells for.
/// </summary>
[ApiController]
[Route("api/soumissions")]
[Authorize(Roles = Roles.StaffAndClients)]
[RequireActiveSubscription]
public class QuotesController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IInvoicePdfService pdf,
    IMailgunService mailgun,
    IConfiguration configuration,
    ILogger<QuotesController> logger) : ControllerBase
{
    private const string Locked = "Cette soumission est devenue un projet : ses prix ne changent plus.";
    private const int MaxResponseNoteLength = 2000;

    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    /// <summary>Every quote this person may read: a customer never sees a draft.</summary>
    private IQueryable<Quote> Visible() =>
        currentUser.IsClient
            ? db.Quotes.Where(q => q.Status != QuoteStatus.Brouillon)
            : db.Quotes;

    [HttpGet]
    public async Task<ActionResult<PagedResult<QuoteDto>>> List(
        [FromQuery] PagingQuery query, [FromQuery] Guid? clientId, [FromQuery] QuoteStatus? status,
        [FromQuery] Guid? clientAssetId)
    {
        var quotes = Visible().AsNoTracking();
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
    [StaffOnly]
    public async Task<ActionResult<QuoteSummaryDto>> Summary(Guid id)
    {
        var quote = await db.Quotes.AsNoTracking().Include(q => q.Lines).FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null) return NotFound();

        var documentsAndNotes = await db.QuoteDocuments.CountAsync(d => d.QuoteId == id)
            + await db.QuoteNotes.CountAsync(n => n.QuoteId == id);

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
            documentsAndNotes,
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
    [StaffOnly]
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
    /// <summary>
    /// The quote as a document: what is attached to the email, and what the customer reads in
    /// their portal. Inline, because it is shown in a viewer rather than downloaded.
    /// </summary>
    [HttpGet("{id:guid}/pdf")]
    public async Task<IActionResult> Pdf(Guid id, CancellationToken ct)
    {
        // Through the visible set first: the renderer reads past the draft rule.
        if (!await Visible().AnyAsync(q => q.Id == id, ct)) return NotFound();

        var rendered = await pdf.RenderQuoteAsync(id, ct);
        if (rendered is not { } document) return NotFound();

        Response.Headers.ContentDisposition = $"inline; filename=\"Soumission-S-{document.Number:0000}.pdf\"";
        return File(document.Bytes, "application/pdf");
    }

    [HttpPost("{id:guid}/convertir")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<QuoteDto>> Convert(Guid id)
    {
        var quote = await LoadForProjectAsync(id);
        if (quote is null) return NotFound();
        if (quote.ProjectId is not null) return BadRequest(new { message = "Cette soumission est déjà devenue un projet." });
        if (quote.Status is QuoteStatus.Refusee or QuoteStatus.Expiree)
            return BadRequest(new { message = "Une soumission refusée ou expirée ne devient pas un projet. Remettez-la en brouillon d'abord." });
        if (quote.Client!.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });

        await CreateProjectAsync(quote);
        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    /// <summary>
    /// The customer says yes from their portal. That is the same step as Convertir en projet —
    /// an accepted quote is a job — so the project is made now, rather than the yes sitting on
    /// the quote until somebody at the office notices it. The company is told by email.
    /// </summary>
    [HttpPost("{id:guid}/accepter")]
    public async Task<ActionResult<QuoteDto>> Accept(Guid id, QuoteResponseRequest request, CancellationToken ct)
    {
        if (!currentUser.IsClient)
            return BadRequest(new { message = "Cette réponse appartient au client. Utilisez « Convertir en projet »." });

        var quote = await LoadForProjectAsync(id);
        if (quote is null) return NotFound();
        if (CanRespond(quote) is { } problem) return BadRequest(new { message = problem });
        if (Clean(request.Note) is { Length: > MaxResponseNoteLength })
            return BadRequest(new { message = $"Le message est limité à {MaxResponseNoteLength} caractères." });
        if (quote.Client!.WorkRefusal() is not null)
            return BadRequest(new { message = "Cette soumission ne peut pas être acceptée en ligne. Communiquez avec l'entreprise." });

        await RecordResponseAsync(quote, request, ct);
        var project = await CreateProjectAsync(quote);
        await db.SaveChangesAsync(ct);

        await NotifyCompanyAsync(quote, accepted: true,
            $"Le projet P-{project.Number:0000} a été créé à partir de la soumission.", ct);
        return Ok(await GetDtoAsync(id));
    }

    /// <summary>The customer says no from their portal, with a reason if they give one.</summary>
    [HttpPost("{id:guid}/refuser")]
    public async Task<ActionResult<QuoteDto>> Refuse(Guid id, QuoteResponseRequest request, CancellationToken ct)
    {
        if (!currentUser.IsClient)
            return BadRequest(new { message = "Cette réponse appartient au client. Changez plutôt le statut de la soumission." });

        var quote = await Visible().Include(q => q.Client).FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return NotFound();
        if (CanRespond(quote) is { } problem) return BadRequest(new { message = problem });
        if (Clean(request.Note) is { Length: > MaxResponseNoteLength })
            return BadRequest(new { message = $"Le message est limité à {MaxResponseNoteLength} caractères." });

        await RecordResponseAsync(quote, request, ct);
        quote.Status = QuoteStatus.Refusee;
        await db.SaveChangesAsync(ct);

        await NotifyCompanyAsync(quote, accepted: false, null, ct);
        return Ok(await GetDtoAsync(id));
    }

    /// <summary>
    /// Why a customer cannot answer this quote, or null. Only a quote that is out with them and
    /// still holds: an expired price is the company's to renew, not the customer's to take.
    /// </summary>
    private static string? CanRespond(Quote quote)
    {
        if (quote.ProjectId is not null || quote.Status == QuoteStatus.Acceptee)
            return "Cette soumission a déjà été acceptée.";
        if (quote.Status == QuoteStatus.Refusee) return "Cette soumission a déjà été refusée.";
        if (quote.Status == QuoteStatus.Expiree
            || (quote.ValidUntil is { } until && until < BusinessDay.Today))
            return "Cette soumission est expirée. Communiquez avec l'entreprise pour un nouveau prix.";
        if (quote.Status != QuoteStatus.Envoyee) return "Cette soumission n'attend pas de réponse.";
        return null;
    }

    private async Task RecordResponseAsync(Quote quote, QuoteResponseRequest request, CancellationToken ct)
    {
        var name = await db.Users.AsNoTracking()
            .Where(u => u.Id == currentUser.UserId)
            .Select(u => u.FirstName + " " + u.LastName)
            .FirstOrDefaultAsync(ct);

        quote.ClientRespondedAt = DateTimeOffset.UtcNow;
        quote.ClientRespondedBy = Clean(name) is { } who ? Truncate(who, 200) : null;
        quote.ClientResponseNote = Clean(request.Note);
        quote.UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Tells the company the customer answered. Best effort: the answer is already saved, and a
    /// mail server that is down must not turn the customer's yes into an error on their screen.
    /// </summary>
    private async Task NotifyCompanyAsync(Quote quote, bool accepted, string? extra, CancellationToken ct)
    {
        try
        {
            var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
                .Where(t => t.Id == quote.TenantId)
                .Select(t => new { t.Name, t.ContactEmail })
                .FirstOrDefaultAsync(ct);
            if (tenant?.ContactEmail is not { Length: > 0 } to) return;

            var number = $"S-{quote.Number:0000}";
            var client = quote.Client?.Name ?? "Le client";
            var verb = accepted ? "accepté" : "refusé";
            var who = quote.ClientRespondedBy is { } name && name != client ? $" ({Html(name)})" : "";
            var note = quote.ClientResponseNote is { } text
                ? $"<p>Son message :</p><blockquote>{Html(text).Replace("\n", "<br>")}</blockquote>"
                : "";
            var body =
                $"<p>{Html(client)}{who} a {verb} la soumission {number} depuis son portail.</p>" +
                (extra is null ? "" : $"<p>{Html(extra)}</p>") +
                note +
                $"<p><a href=\"{FrontendUrl}/soumissions/{quote.Id}\">Ouvrir la soumission</a></p>";

            await mailgun.SendAsync(to, tenant.Name, $"Soumission {number} {verb}e par {client}", body, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not tell tenant {TenantId} about the answer to quote {QuoteId}", quote.TenantId, quote.Id);
        }
    }

    private static string Html(string value) => value
        .Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

    private Task<Quote?> LoadForProjectAsync(Guid id) =>
        Visible()
            .Include(q => q.Lines)
            .Include(q => q.Documents)
            .Include(q => q.Notes)
            .Include(q => q.Client)
            .FirstOrDefaultAsync(q => q.Id == id);

    /// <summary>
    /// Builds the project an accepted quote becomes, links the two and marks the quote accepted.
    /// Does not save, so the caller's own changes go in the same transaction.
    /// </summary>
    private async Task<Project> CreateProjectAsync(Quote quote)
    {
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

        // The paperwork and the thread follow the job: the documents point at the same files,
        // and the notes keep their author and their date, so the crew reads what was promised
        // in the order it was said.
        foreach (var document in quote.Documents)
        {
            project.Documents.Add(new ProjectDocument
            {
                TenantId = tenantId,
                Title = document.Title,
                Category = document.Category,
                MediaAssetId = document.MediaAssetId,
                UploadedById = document.UploadedById,
                CreatedAt = document.CreatedAt,
            });
        }

        foreach (var note in quote.Notes)
        {
            project.Notes.Add(new ProjectNote
            {
                TenantId = tenantId,
                Body = note.Body,
                CreatedById = note.CreatedById,
                CreatedAt = note.CreatedAt,
                UpdatedAt = note.UpdatedAt,
            });
        }

        db.Projects.Add(project);
        quote.ProjectId = project.Id;
        quote.Status = QuoteStatus.Acceptee;
        quote.UpdatedAt = DateTimeOffset.UtcNow;
        return project;
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
        Visible().AsNoTracking().Where(q => q.Id == id).Select(ToDto()).FirstOrDefaultAsync();

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
        q.UpdatedAt,
        q.SentAt,
        q.ClientRespondedAt,
        q.ClientRespondedBy,
        q.ClientResponseNote);
}
