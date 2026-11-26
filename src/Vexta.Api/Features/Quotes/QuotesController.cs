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
    private const string Locked = "Cette soumission est devenue un projet ou une facture : ses prix ne changent plus.";

    /// <summary>Made a project or billed directly: either way the price is settled.</summary>
    /// <summary>
    /// Its prices became those of a job or of an invoice — a deposit billed counts, since the
    /// deposit was worked out from them.
    /// </summary>
    private static bool IsLocked(Quote quote) =>
        quote.ProjectId is not null || quote.InvoiceId is not null || quote.DepositInvoiceId is not null;
    private const int MaxResponseNoteLength = 2000;

    private string FrontendUrl => configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:3000";

    /// <summary>Every quote this person may read: a customer never sees a draft.</summary>
    private IQueryable<Quote> Visible() =>
        currentUser.IsClient
            ? db.Quotes.Where(q => q.Status != QuoteStatus.Brouillon)
            : db.Quotes;

    /// <summary>
    /// Sent quotes whose validity date has passed become Expirée. Done when quotes are read
    /// rather than on a timer: there is no scheduler in this application, and a status is only
    /// wrong if somebody can see it, so the moment it is read is the moment it has to be right.
    /// The tenant filter (and, for a customer, the client filter) bounds the update.
    /// </summary>
    private Task ExpireLapsedAsync(CancellationToken ct = default)
    {
        var today = BusinessDay.Today;
        return db.Quotes
            .Where(q => q.Status == QuoteStatus.Envoyee && q.ProjectId == null && q.InvoiceId == null
                && q.ValidUntil != null && q.ValidUntil < today)
            .ExecuteUpdateAsync(set => set
                .SetProperty(q => q.Status, QuoteStatus.Expiree)
                .SetProperty(q => q.UpdatedAt, DateTimeOffset.UtcNow), ct);
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<QuoteDto>>> List(
        [FromQuery] PagingQuery query, [FromQuery] Guid? clientId, [FromQuery] QuoteStatus? status,
        [FromQuery] Guid? clientAssetId)
    {
        await ExpireLapsedAsync();
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

        var filter = new ListFilter(Request.Query);
        quotes = ApplyColumnFilters(quotes, filter);

        var totalCount = await quotes.CountAsync();
        var items = await filter.Sort(quotes, new Dictionary<string, System.Linq.Expressions.LambdaExpression>
            {
                ["numero"] = ListFilter.By<Quote, int>(q => q.Number),
                ["client"] = ListFilter.By<Quote, string>(q => q.Client!.Name),
                ["description"] = ListFilter.By<Quote, string?>(q => q.Description),
                ["statut"] = ListFilter.By<Quote, QuoteStatus>(q => q.Status),
                ["date"] = ListFilter.By<Quote, DateOnly?>(q => q.IssuedOn),
                ["validite"] = ListFilter.By<Quote, DateOnly?>(q => q.ValidUntil),
                ["po"] = ListFilter.By<Quote, string?>(q => q.PoNumber),
            }, ListFilter.By<Quote, int>(q => q.Number))
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(ToDto())
            .ToListAsync();

        return Ok(new PagedResult<QuoteDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    /// <summary>The table's column filters, by the screen's column names.</summary>
    private static IQueryable<Quote> ApplyColumnFilters(IQueryable<Quote> quotes, ListFilter f)
    {
        if (f.Min("numero") is { } numberMin) quotes = quotes.Where(q => q.Number >= numberMin);
        if (f.Max("numero") is { } numberMax) quotes = quotes.Where(q => q.Number <= numberMax);
        if (f.Ids("client") is { Count: > 0 } clients) quotes = quotes.Where(q => clients.Contains(q.ClientId));
        if (f.Contains("description") is { } description)
            quotes = quotes.Where(q => q.Description != null && EF.Functions.ILike(q.Description, description));
        if (f.Enums<QuoteStatus>("statut") is { Count: > 0 } statuses) quotes = quotes.Where(q => statuses.Contains(q.Status));
        if (f.From("date") is { } issuedFrom) quotes = quotes.Where(q => q.IssuedOn >= issuedFrom);
        if (f.To("date") is { } issuedTo) quotes = quotes.Where(q => q.IssuedOn <= issuedTo);
        if (f.From("validite") is { } validFrom) quotes = quotes.Where(q => q.ValidUntil >= validFrom);
        if (f.To("validite") is { } validTo) quotes = quotes.Where(q => q.ValidUntil <= validTo);
        if (f.Contains("po") is { } po) quotes = quotes.Where(q => q.PoNumber != null && EF.Functions.ILike(q.PoNumber, po));
        if (f.Min("projet") is { } projectMin) quotes = quotes.Where(q => q.Project != null && q.Project.Number >= projectMin);
        if (f.Max("projet") is { } projectMax) quotes = quotes.Where(q => q.Project != null && q.Project.Number <= projectMax);
        if (f.Min("montant") is { } amountMin)
            quotes = quotes.Where(q => q.Lines.Where(l => !l.IsOptional || l.IsSelected).Sum(l => Math.Round(l.Quantity * l.UnitPrice, 2)) >= amountMin);
        if (f.Max("montant") is { } amountMax)
            quotes = quotes.Where(q => q.Lines.Where(l => !l.IsOptional || l.IsSelected).Sum(l => Math.Round(l.Quantity * l.UnitPrice, 2)) <= amountMax);
        return quotes;
    }

    /// <summary>
    /// How many quotes per status, among those this person may read. Lapsed ones are expired
    /// first, so the counts and the filtered list agree. A customer's answer with no row at all
    /// is also how the portal knows to leave « Mes soumissions » out of its menu.
    /// </summary>
    [HttpGet("statuts")]
    public async Task<ActionResult<List<QuoteStatusCountDto>>> StatusCounts(CancellationToken ct)
    {
        await ExpireLapsedAsync(ct);
        var counts = await Visible().AsNoTracking()
            .GroupBy(q => q.Status)
            .Select(g => new QuoteStatusCountDto(g.Key, g.Count()))
            .ToListAsync(ct);
        return Ok(counts.OrderBy(c => c.Status).ToList());
    }

    /// <summary>
    /// The quotes sent in the last <paramref name="jours"/> days and what became of them, for
    /// the company's dashboard. Counted by when they were sent, so a quote answered this week
    /// for a price given in the spring belongs to the spring. Amounts are before taxes.
    /// </summary>
    [HttpGet("statistiques")]
    [StaffOnly]
    public async Task<ActionResult<QuoteStatsDto>> Stats([FromQuery] int jours = 90, CancellationToken ct = default)
    {
        jours = Math.Clamp(jours, 7, 366);
        await ExpireLapsedAsync(ct);
        var since = DateTimeOffset.UtcNow.AddDays(-jours);

        var rows = await db.Quotes.AsNoTracking()
            // A superseded version is not a price the client could answer any more; its revision counts.
            .Where(q => q.SentAt != null && q.SentAt >= since && q.Status != QuoteStatus.Remplacee)
            .Select(q => new
            {
                // A quote made a project counts as accepted whatever its status says.
                Accepted = q.ProjectId != null || q.InvoiceId != null || q.Status == QuoteStatus.Acceptee,
                q.Status,
                Amount = q.Lines.Where(l => !l.IsOptional || l.IsSelected).Sum(l => (decimal?)(l.Quantity * l.UnitPrice)) ?? 0m
            })
            .ToListAsync(ct);

        var accepted = rows.Where(r => r.Accepted).ToList();
        var refused = rows.Count(r => !r.Accepted && r.Status == QuoteStatus.Refusee);
        var expired = rows.Count(r => !r.Accepted && r.Status == QuoteStatus.Expiree);
        var decided = accepted.Count + refused + expired;

        return Ok(new QuoteStatsDto(
            jours,
            rows.Count,
            accepted.Count,
            refused,
            expired,
            rows.Count - decided,
            decided == 0 ? null : Math.Round(100m * accepted.Count / decided, 1),
            Math.Round(rows.Sum(r => r.Amount), 2),
            Math.Round(accepted.Sum(r => r.Amount), 2)));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<QuoteDto>> Get(Guid id)
    {
        await ExpireLapsedAsync();
        var quote = await GetDtoAsync(id);
        return quote is null ? NotFound() : Ok(quote);
    }

    /// <summary>
    /// The signature the client drew when accepting, for the screens that show it. Read through
    /// the same visibility as the quote: a client sees their own, staff their company's.
    /// </summary>
    [HttpGet("{id:guid}/signature")]
    public async Task<IActionResult> DrawnSignature(Guid id, CancellationToken ct)
    {
        var png = await Visible().AsNoTracking()
            .Where(q => q.Id == id)
            .Select(q => q.ClientSignaturePng)
            .FirstOrDefaultAsync(ct);
        if (png is null) return NotFound();
        // Never changes once given, but private: kept by this browser only.
        Response.Headers.CacheControl = "private, max-age=86400";
        return File(png, "image/png");
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
            // Options not taken are not part of the price, so not of the cost table either.
            var lines = quote.Lines.Where(l => l.Kind == kind && l.Counts).ToList();
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

        // An empty cost reads as free, which makes the margin look better than it is.
        var withoutCost = quote.Lines.Count(l => l.Counts && l.UnitCost is null && l.UnitPrice > 0);

        return Ok(new QuoteSummaryDto(
            quote.Lines.Count(l => l.Kind == QuoteLineKind.Tache),
            quote.Lines.Count(l => l.Kind == QuoteLineKind.Materiel),
            quote.Lines.Count(l => l.Kind == QuoteLineKind.Frais),
            documentsAndNotes,
            costs,
            withoutCost));
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

        // From a template: its lines, and its description and deposit where the form left them empty.
        if (request.TemplateId is { } templateId)
        {
            var template = await db.QuoteTemplates.AsNoTracking()
                .Include(t => t.Lines)
                .FirstOrDefaultAsync(t => t.Id == templateId);
            if (template is null) return BadRequest(new { message = "Ce modèle n'existe plus." });

            if (string.IsNullOrWhiteSpace(quote.Description)) quote.Description = template.Description;
            quote.DepositPercent ??= template.DepositPercent;
            quote.Lines = [.. template.Lines.OrderBy(l => l.Kind).ThenBy(l => l.SortOrder).Select(l => new QuoteLine
            {
                TenantId = tenantId,
                Kind = l.Kind,
                ProductId = l.ProductId,
                Code = l.Code,
                Description = l.Description,
                Unit = l.Unit,
                Quantity = l.Quantity,
                UnitCost = l.UnitCost,
                UnitPrice = l.UnitPrice,
                IsOptional = l.IsOptional,
                SortOrder = l.SortOrder
            })];
        }

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
        if (IsLocked(quote)
            && (quote.ClientId != request.ClientId
                || quote.IsTaxExempt != (request.IsTaxExempt ?? quote.IsTaxExempt)
                || request.Status != quote.Status))
        {
            return BadRequest(new { message = Locked });
        }

        if (!IsLocked(quote) && request.Status == QuoteStatus.Acceptee)
            return BadRequest(new { message = "Une soumission est acceptée en la convertissant en projet." });

        if (await InvalidAsync(request) is { } problem) return BadRequest(new { message = problem });

        quote.ClientId = request.ClientId;
        quote.IsTaxExempt = request.IsTaxExempt ?? quote.IsTaxExempt;
        Apply(quote, request);
        quote.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Ok(await GetDtoAsync(id));
    }

    /// <summary>
    /// A request received through a « Demande de soumission » form, made into a draft quote for
    /// the client who sent it. The work described becomes the quote's description, and every
    /// answer is copied onto it as a note, so whoever prices it has the request beside the lines
    /// without going back to Réponses. One quote per request: the link is what tells the office
    /// a request has been dealt with.
    /// </summary>
    [HttpPost("depuis-reponse/{submissionId:guid}")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<QuoteDto>> FromSubmission(Guid submissionId, CancellationToken ct)
    {
        var submission = await db.FormSubmissions
            .Include(s => s.FormTemplate)
            .Include(s => s.CreatedClient)
            .Include(s => s.CreatedQuote)
            .FirstOrDefaultAsync(s => s.Id == submissionId, ct);
        if (submission is null) return NotFound();

        if (submission.FormTemplate!.Kind != FormKind.Soumission)
            return BadRequest(new { message = "Seule une demande de soumission devient une soumission." });
        if (submission.CreatedQuote is { } existing)
            return BadRequest(new { message = $"Cette demande a déjà sa soumission, {existing.Label}." });
        if (submission.CreatedClient is not { } client)
            return BadRequest(new { message = "Cette demande n'est rattachée à aucun client. Créez la soumission depuis la fiche du client." });
        if (client.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });

        var answers = await db.FormAnswers.AsNoTracking()
            .Where(a => a.SubmissionId == submissionId)
            .OrderBy(a => a.SortOrder)
            .Select(a => new { a.Label, a.Type, a.Value, a.MediaAssetId })
            .ToListAsync(ct);

        // The first long answer is the work described — the base form asks for it first.
        var work = answers.FirstOrDefault(a => a.Type == FormFieldType.TexteLong && !string.IsNullOrWhiteSpace(a.Value))?.Value?.Trim();

        var note = new System.Text.StringBuilder()
            .Append($"Demande reçue le {BusinessDay.DateOf(submission.CreatedAt):yyyy-MM-dd} par le formulaire « {submission.FormTemplate.Title} »");
        if (!string.IsNullOrWhiteSpace(submission.SubmittedByName)) note.Append($", de {submission.SubmittedByName}");
        note.Append('.');
        foreach (var answer in answers)
        {
            var value = answer.MediaAssetId is not null
                ? "un fichier, joint à la réponse dans Formulaires › Réponses"
                : answer.Value?.Trim();
            if (string.IsNullOrEmpty(value)) continue;
            note.Append(Environment.NewLine).Append(Environment.NewLine).Append(answer.Label).Append(" : ").Append(value);
        }

        var tenantId = currentUser.TenantId!.Value;
        var quote = new Quote
        {
            TenantId = tenantId,
            Number = await NextNumberAsync(tenantId),
            ClientId = client.Id,
            IsTaxExempt = client.IsTaxExempt,
            Status = QuoteStatus.Brouillon,
            IssuedOn = BusinessDay.Today,
            Description = work is null ? null : Truncate(work, 4000),
            Notes =
            [
                new QuoteNote { TenantId = tenantId, Body = Truncate(note.ToString(), 4000), CreatedById = currentUser.UserId }
            ]
        };

        db.Quotes.Add(quote);
        submission.CreatedQuoteId = quote.Id;
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = quote.Id }, await GetDtoAsync(quote.Id));
    }

    /// <summary>
    /// A new draft with the same client, words and lines — for pricing again after a refusal or
    /// an expiry, or for a job like one already quoted. What happened to the original (sent,
    /// answered, made a project) stays with it; its documents and notes stay too, being about
    /// that quote. The validity keeps its length, counted from today.
    /// </summary>
    [HttpPost("{id:guid}/dupliquer")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<QuoteDto>> Duplicate(Guid id)
    {
        var source = await db.Quotes.AsNoTracking()
            .Include(q => q.Lines)
            .Include(q => q.Client)
            .FirstOrDefaultAsync(q => q.Id == id);
        if (source is null) return NotFound();
        if (source.Client!.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });

        var today = BusinessDay.Today;
        var validity = source.ValidUntil is { } until
            ? until.DayNumber - (source.IssuedOn ?? DateOnly.FromDateTime(source.CreatedAt.UtcDateTime)).DayNumber
            : (int?)null;

        var tenantId = currentUser.TenantId!.Value;
        var copy = new Quote
        {
            TenantId = tenantId,
            Number = await NextNumberAsync(tenantId),
            ClientId = source.ClientId,
            PoNumber = source.PoNumber,
            Description = source.Description,
            Status = QuoteStatus.Brouillon,
            IssuedOn = today,
            ValidUntil = validity is >= 0 and var days ? today.AddDays(days) : null,
            IsTaxExempt = source.IsTaxExempt,
            ClientAssetId = source.ClientAssetId,
            ClientAddressId = source.ClientAddressId,
            SameAddressAsClient = source.SameAddressAsClient,
            SiteAddressId = source.SiteAddressId,
            CategoryId = source.CategoryId,
            SubCategoryId = source.SubCategoryId,
            WageClassificationId = source.WageClassificationId,
            DepositPercent = source.DepositPercent,
            // Dates of the work are not copied: they belong to the job that was planned.
            Lines = [.. source.Lines.OrderBy(l => l.SortOrder).Select(l => new QuoteLine
            {
                TenantId = tenantId,
                Kind = l.Kind,
                ProductId = l.ProductId,
                Code = l.Code,
                Description = l.Description,
                Unit = l.Unit,
                Quantity = l.Quantity,
                UnitCost = l.UnitCost,
                UnitPrice = l.UnitPrice,
                // An option stays an option; whether it was taken belongs to the original.
                IsOptional = l.IsOptional,
                SortOrder = l.SortOrder
            })]
        };

        db.Quotes.Add(copy);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = copy.Id }, await GetDtoAsync(copy.Id));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    public async Task<IActionResult> Delete(Guid id)
    {
        var quote = await db.Quotes.FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null) return NotFound();

        // Deleting a revision gives the version it replaced its place back, rather than leaving
        // the job with nothing but a « Remplacée » quote. Expiry sorts out a lapsed date on read.
        if (quote.ReplacesId is { } previousId
            && await db.Quotes.FirstOrDefaultAsync(q => q.Id == previousId) is { Status: QuoteStatus.Remplacee } previous
            && !await db.Quotes.AnyAsync(q => q.ReplacesId == previousId && q.Id != id))
        {
            previous.Status = previous.SentAt is null ? QuoteStatus.Brouillon : QuoteStatus.Envoyee;
            previous.UpdatedAt = DateTimeOffset.UtcNow;
        }

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
        if (IsLocked(quote)) return BadRequest(new { message = Locked });
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
        if (IsLocked(line.Quote!)) return BadRequest(new { message = Locked });
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
        if (IsLocked(line.Quote!)) return BadRequest(new { message = Locked });

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

        Response.Headers.ContentDisposition = $"inline; filename=\"Soumission-{document.Label.Replace(" rév. ", "-rev")}.pdf\"";
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
        if (quote.InvoiceId is not null) return BadRequest(new { message = "Cette soumission a déjà été facturée directement." });
        if (quote.Status == QuoteStatus.Remplacee)
            return BadRequest(new { message = "Cette version a été remplacée par une révision. Convertissez la révision." });
        if (quote.Status is QuoteStatus.Refusee or QuoteStatus.Expiree)
            return BadRequest(new { message = "Une soumission refusée ou expirée ne devient pas un projet. Remettez-la en brouillon d'abord." });
        if (quote.Client!.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });

        var converted = await CreateProjectAsync(quote);
        await CreateDepositInvoiceAsync(quote, converted);
        await AttachDepositAsync(quote, converted);
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

        // Typing one's name is the signature: two letters at least, so an empty or stray key
        // press is not taken for one.
        var signature = Clean(request.Signature);
        if (signature is not { Length: >= 2 })
            return BadRequest(new { message = "Tapez votre nom complet pour signer l'acceptation." });
        if (signature.Length > 200)
            return BadRequest(new { message = "Le nom est limité à 200 caractères." });
        if (SignaturePng.Read(request.SignatureImage) is not { } drawn)
            return BadRequest(new { message = "Signez dans le cadre avec le doigt ou la souris." });

        // The options taken, checked against this quote's own optional lines: an id from
        // anywhere else is refused rather than ignored, so the client never accepts a total
        // other than the one they were shown.
        var chosen = request.OptionIds?.Distinct().ToList() ?? [];
        var options = quote.Lines.Where(l => l.IsOptional).ToList();
        if (chosen.Any(optionId => options.All(l => l.Id != optionId)))
            return BadRequest(new { message = "Une des options choisies ne fait pas partie de cette soumission." });
        foreach (var option in options) option.IsSelected = chosen.Contains(option.Id);

        await RecordResponseAsync(quote, request, ct);
        quote.ClientSignature = signature;
        quote.ClientSignaturePng = drawn;
        var project = await CreateProjectAsync(quote);
        var deposit = await CreateDepositInvoiceAsync(quote, project);
        await db.SaveChangesAsync(ct);

        var taken = options.Where(l => l.IsSelected).Select(l => l.Description).ToList();
        var extra = $"Le projet P-{project.Number:0000} a été créé à partir de la soumission.";
        if (taken.Count > 0) extra += $" Options retenues : {string.Join(", ", taken)}.";
        if (deposit is not null) extra += $" La facture d'acompte {deposit.Number} est prête en brouillon : vérifiez-la et envoyez-la au client.";
        await NotifyCompanyAsync(quote, accepted: true, extra, ct);
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
        if (IsLocked(quote) || quote.Status == QuoteStatus.Acceptee)
            return "Cette soumission a déjà été acceptée.";
        if (quote.Status == QuoteStatus.Remplacee)
            return "Cette version a été remplacée par une soumission révisée. Ouvrez la plus récente.";
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

            var number = quote.Label;
            var client = quote.Client?.Name ?? "Le client";
            var verb = accepted ? "accepté" : "refusé";
            var who = quote.ClientRespondedBy is { } name && name != client ? $" ({Html(name)})" : "";
            var signed = quote.ClientSignature is { } signature
                ? $"<p>Signée électroniquement au nom de <strong>{Html(signature)}</strong>.</p>"
                : "";
            var note = quote.ClientResponseNote is { } text
                ? $"<p>Son message :</p><blockquote>{Html(text).Replace("\n", "<br>")}</blockquote>"
                : "";
            var body =
                $"<p>{Html(client)}{who} a {verb} la soumission {number} depuis son portail.</p>" +
                signed +
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
    /// A new version of a quote that is out with the client (sent, refused or expired): the same
    /// number, the next revision, as a draft with the same lines to change. The version it
    /// replaces stays readable as « Remplacée » — the trace of what was proposed — and can no
    /// longer be answered. Its documents and notes come along — the plan and the visit notes
    /// are still what the new price is built on — the files pointed at again, never copied.
    /// </summary>
    [HttpPost("{id:guid}/reviser")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<QuoteDto>> Revise(Guid id, CancellationToken ct)
    {
        var source = await db.Quotes
            .Include(q => q.Lines).Include(q => q.Documents).Include(q => q.Notes)
            .FirstOrDefaultAsync(q => q.Id == id, ct);
        if (source is null) return NotFound();
        if (IsLocked(source) || source.Status == QuoteStatus.Acceptee)
            return BadRequest(new { message = "Une soumission acceptée ne se révise plus : ses prix sont devenus ceux du travail." });
        if (source.Status == QuoteStatus.Remplacee)
            return BadRequest(new { message = "Cette version a déjà été révisée. Révisez la plus récente." });
        if (source.Status == QuoteStatus.Brouillon)
            return BadRequest(new { message = "Un brouillon se modifie directement : il n'a pas encore été donné au client." });

        var today = BusinessDay.Today;
        var validity = source.ValidUntil is { } until
            ? until.DayNumber - (source.IssuedOn ?? DateOnly.FromDateTime(source.CreatedAt.UtcDateTime)).DayNumber
            : (int?)null;
        var revision = await db.Quotes.Where(q => q.Number == source.Number).MaxAsync(q => q.Revision, ct) + 1;

        var next = new Quote
        {
            TenantId = source.TenantId,
            Number = source.Number,
            Revision = revision,
            ReplacesId = source.Id,
            ClientId = source.ClientId,
            PoNumber = source.PoNumber,
            Description = source.Description,
            Status = QuoteStatus.Brouillon,
            IssuedOn = today,
            ValidUntil = validity is >= 0 and var days ? today.AddDays(days) : null,
            StartDate = source.StartDate,
            EndDate = source.EndDate,
            IsTaxExempt = source.IsTaxExempt,
            ClientAssetId = source.ClientAssetId,
            ClientAddressId = source.ClientAddressId,
            SameAddressAsClient = source.SameAddressAsClient,
            SiteAddressId = source.SiteAddressId,
            CategoryId = source.CategoryId,
            SubCategoryId = source.SubCategoryId,
            WageClassificationId = source.WageClassificationId,
            DepositPercent = source.DepositPercent,
            Lines = [.. source.Lines.OrderBy(l => l.Kind).ThenBy(l => l.SortOrder).Select(l => new QuoteLine
            {
                TenantId = source.TenantId,
                Kind = l.Kind,
                ProductId = l.ProductId,
                Code = l.Code,
                Description = l.Description,
                Unit = l.Unit,
                Quantity = l.Quantity,
                UnitCost = l.UnitCost,
                UnitPrice = l.UnitPrice,
                IsOptional = l.IsOptional,
                SortOrder = l.SortOrder
            })],
            // Dated as filed, so the thread still reads in the order things were said.
            Documents = [.. source.Documents.Select(d => new QuoteDocument
            {
                TenantId = source.TenantId,
                Title = d.Title,
                Category = d.Category,
                MediaAssetId = d.MediaAssetId,
                UploadedById = d.UploadedById,
                CreatedAt = d.CreatedAt
            })],
            Notes = [.. source.Notes.Select(n => new QuoteNote
            {
                TenantId = source.TenantId,
                Body = n.Body,
                CreatedById = n.CreatedById,
                CreatedAt = n.CreatedAt,
                UpdatedAt = n.UpdatedAt
            })]
        };

        source.Status = QuoteStatus.Remplacee;
        source.UpdatedAt = DateTimeOffset.UtcNow;
        db.Quotes.Add(next);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = next.Id }, await GetDtoAsync(next.Id));
    }

    /// <summary>
    /// Bills a quote directly, for a small job that needs no project: an invoice in Brouillon
    /// with the quote's lines (options taken included), for the company to check and send. The
    /// quote becomes Acceptée and its prices freeze, as they would by becoming a project.
    /// </summary>
    [HttpPost("{id:guid}/facturer")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<QuoteDto>> InvoiceDirectly(Guid id, CancellationToken ct)
    {
        var quote = await db.Quotes.Include(q => q.Lines).Include(q => q.Client).FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return NotFound();
        if (quote.ProjectId is not null)
            return BadRequest(new { message = "Cette soumission est devenue un projet : facturez le projet." });
        if (quote.InvoiceId is not null) return BadRequest(new { message = "Cette soumission a déjà été facturée." });
        if (quote.Status is QuoteStatus.Refusee or QuoteStatus.Expiree or QuoteStatus.Remplacee)
            return BadRequest(new { message = "Une soumission refusée, expirée ou remplacée ne se facture pas." });
        if (quote.Client!.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });

        var counted = quote.Lines.Where(l => l.Counts).OrderBy(l => l.Kind).ThenBy(l => l.SortOrder).ToList();
        if (counted.Count == 0) return BadRequest(new { message = "Ajoutez des lignes avant de facturer." });

        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == quote.TenantId, ct);
        if (settings?.ConfiguredAt is null)
            return BadRequest(new { message = "Remplissez les paramètres de facturation avant de créer une facture." });

        // A deposit already billed comes off, as on a project's final invoice: one line at the
        // deposit's own amount before taxes, so its taxes come off with it. Not if cancelled.
        var deposit = quote.DepositInvoiceId is { } depositId
            ? await db.Invoices.AsNoTracking()
                .Where(i => i.Id == depositId && i.Status != InvoiceStatus.Annulee)
                .Select(i => new { i.Number, Amount = i.Lines.Sum(l => Math.Round(l.Quantity * l.UnitPrice, 2)) })
                .FirstOrDefaultAsync(ct)
            : null;

        var today = BusinessDay.Today;
        var invoice = new Invoice
        {
            TenantId = quote.TenantId,
            Number = Vexta.Api.Features.BillingSettings.InvoiceNumbering.Format(settings.InvoicePrefix, settings.NextInvoiceNumber),
            ClientId = quote.ClientId,
            Status = InvoiceStatus.Brouillon,
            IssueDate = today,
            DueDate = today.AddDays(settings.PaymentTermsDays),
            Currency = string.IsNullOrWhiteSpace(settings.Currency) ? "CAD" : settings.Currency.Trim().ToUpperInvariant(),
            Notes = Clean(quote.Description) is { } words
                ? $"{words}{Environment.NewLine}Selon la soumission {quote.Label}."
                : $"Selon la soumission {quote.Label}.",
            IsTaxExempt = quote.IsTaxExempt,
            PricePolicyId = settings.DefaultPricePolicyId,
            Lines = [.. counted.Select((l, index) => new InvoiceLine
            {
                Kind = l.Kind switch
                {
                    QuoteLineKind.Tache => InvoiceLineKind.MainDOeuvre,
                    QuoteLineKind.Materiel => InvoiceLineKind.Materiaux,
                    _ => InvoiceLineKind.FraisSupplementaires
                },
                ProductId = l.ProductId,
                Description = l.Unit is { Length: > 0 } unit ? $"{l.Description} ({unit})" : l.Description,
                Quantity = l.Quantity,
                PurchasePrice = l.UnitCost,
                UnitPrice = l.UnitPrice,
                IsTaxable = !quote.IsTaxExempt,
                SortOrder = index
            })]
        };
        if (deposit is { Amount: > 0 })
        {
            invoice.Lines.Add(new InvoiceLine
            {
                Kind = InvoiceLineKind.Autre,
                Description = $"Moins : acompte facturé ({deposit.Number})",
                Quantity = 1,
                UnitPrice = -deposit.Amount,
                IsTaxable = !quote.IsTaxExempt,
                SortOrder = invoice.Lines.Count
            });
        }

        settings.NextInvoiceNumber++;
        db.Invoices.Add(invoice);
        quote.InvoiceId = invoice.Id;
        quote.Status = QuoteStatus.Acceptee;
        quote.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(await GetDtoAsync(id));
    }

    /// <summary>
    /// The deposit invoice for a quote that asks for one, drafted against the new project and
    /// left in Brouillon: an invoice is a legal document, so the company checks it and sends it
    /// itself (with its « Payer en ligne » button when it takes cards). Skipped when billing is
    /// not set up yet — numbering and taxes are the company's to decide, never guessed here.
    /// Does not save.
    /// </summary>
    private async Task<Invoice?> CreateDepositInvoiceAsync(Quote quote, Project? project)
    {
        if (quote.DepositPercent is not { } percent || percent <= 0 || quote.DepositInvoiceId is not null) return null;

        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == quote.TenantId);
        if (settings?.ConfiguredAt is null) return null;

        var subtotal = Round(quote.Lines.Where(l => l.Counts).Sum(LineTotal));
        var amount = Round(subtotal * percent / 100m);
        if (amount <= 0) return null;

        var today = BusinessDay.Today;
        var invoice = new Invoice
        {
            TenantId = quote.TenantId,
            Number = Vexta.Api.Features.BillingSettings.InvoiceNumbering.Format(settings.InvoicePrefix, settings.NextInvoiceNumber),
            ClientId = quote.ClientId,
            ProjectId = project?.Id,
            Status = InvoiceStatus.Brouillon,
            IssueDate = today,
            DueDate = today.AddDays(settings.PaymentTermsDays),
            Currency = string.IsNullOrWhiteSpace(settings.Currency) ? "CAD" : settings.Currency.Trim().ToUpperInvariant(),
            Notes = $"Acompte demandé à l'acceptation de la soumission {quote.Label}.",
            IsTaxExempt = quote.IsTaxExempt,
            Lines =
            [
                new InvoiceLine
                {
                    Kind = InvoiceLineKind.Autre,
                    Description = $"Acompte de {percent.ToString("0.##", Formats.Quebec)} % — soumission {quote.Label}",
                    Quantity = 1,
                    UnitPrice = amount,
                    IsTaxable = !quote.IsTaxExempt,
                    SortOrder = 0
                }
            ]
        };

        // Advanced, never derived: the same rule as every other invoice.
        settings.NextInvoiceNumber++;
        db.Invoices.Add(invoice);
        quote.DepositInvoiceId = invoice.Id;
        return invoice;
    }

    /// <summary>
    /// Bills the deposit of a quote that is not becoming a project — the small job billed
    /// directly later with « Facturer sans projet », which then takes it off. The client said
    /// yes by agreeing to pay it, so the quote becomes Acceptée and its prices freeze.
    /// </summary>
    [HttpPost("{id:guid}/acompte")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<QuoteDto>> InvoiceDeposit(Guid id, CancellationToken ct)
    {
        var quote = await db.Quotes.Include(q => q.Lines).Include(q => q.Client).FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return NotFound();
        if (quote.DepositInvoiceId is not null) return BadRequest(new { message = "L'acompte de cette soumission a déjà été facturé." });
        if (quote.ProjectId is not null || quote.InvoiceId is not null)
            return BadRequest(new { message = "Cette soumission a déjà été convertie ou facturée." });
        if (quote.DepositPercent is not > 0)
            return BadRequest(new { message = "Cette soumission ne demande pas d'acompte." });
        if (quote.Status is QuoteStatus.Refusee or QuoteStatus.Expiree or QuoteStatus.Remplacee)
            return BadRequest(new { message = "Une soumission refusée, expirée ou remplacée ne se facture pas." });
        if (quote.Client!.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });
        if (!quote.Lines.Any(l => l.Counts)) return BadRequest(new { message = "Ajoutez des lignes avant de facturer." });

        if (await db.BillingSettings.AnyAsync(b => b.TenantId == quote.TenantId && b.ConfiguredAt != null, ct) is false)
            return BadRequest(new { message = "Remplissez les paramètres de facturation avant de créer une facture." });

        if (await CreateDepositInvoiceAsync(quote, null) is null)
            return BadRequest(new { message = "Le montant de l'acompte est nul : vérifiez les lignes de la soumission." });

        quote.Status = QuoteStatus.Acceptee;
        quote.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(await GetDtoAsync(id));
    }

    /// <summary>
    /// A deposit billed before the quote became a project belongs to that project from now on,
    /// so the project's final invoice finds it and takes it off. Does not save.
    /// </summary>
    private async Task AttachDepositAsync(Quote quote, Project project)
    {
        if (quote.DepositInvoiceId is not { } depositId) return;
        var deposit = await db.Invoices.FirstOrDefaultAsync(i => i.Id == depositId);
        if (deposit is { ProjectId: null }) deposit.ProjectId = project.Id;
    }

    /// <summary>
    /// What changed from the version this one revises: each line added, removed or changed, and
    /// the two totals. Lines are matched by section and description — a revision copies them
    /// under new ids, and the description is what the client reads.
    /// </summary>
    [HttpGet("{id:guid}/comparaison")]
    [StaffOnly]
    public async Task<ActionResult<QuoteComparisonDto>> Compare(Guid id, CancellationToken ct)
    {
        var quote = await db.Quotes.AsNoTracking().Include(q => q.Lines).FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return NotFound();
        if (quote.ReplacesId is not { } previousId)
            return BadRequest(new { message = "Cette soumission n'est pas une révision." });
        var previous = await db.Quotes.AsNoTracking().Include(q => q.Lines).FirstOrDefaultAsync(q => q.Id == previousId, ct);
        if (previous is null) return NotFound();

        static string Key(QuoteLine l) => $"{(int)l.Kind}|{l.Description.Trim().ToLowerInvariant()}";
        static QuoteLineSnapshotDto Snap(QuoteLine l) =>
            new(l.Quantity, l.Unit, l.UnitPrice, LineTotal(l), l.IsOptional, l.IsSelected);
        static IEnumerable<QuoteLine> Ordered(Quote q) => q.Lines.OrderBy(l => l.Kind).ThenBy(l => l.SortOrder);

        // Same description twice in one section pairs up in order, first with first.
        var before = Ordered(previous).GroupBy(Key).ToDictionary(g => g.Key, g => new Queue<QuoteLine>(g));
        var changes = new List<QuoteLineChangeDto>();
        foreach (var line in Ordered(quote))
        {
            var old = before.TryGetValue(Key(line), out var queue) && queue.Count > 0 ? queue.Dequeue() : null;
            var after = Snap(line);
            if (old is null)
            {
                changes.Add(new QuoteLineChangeDto(line.Kind, line.Description, QuoteLineChange.Ajoutee, null, after));
                continue;
            }
            var was = Snap(old);
            var same = was.Quantity == after.Quantity && was.UnitPrice == after.UnitPrice
                && was.IsOptional == after.IsOptional && was.Unit == after.Unit;
            changes.Add(new QuoteLineChangeDto(line.Kind, line.Description,
                same ? QuoteLineChange.Inchangee : QuoteLineChange.Modifiee, was, after));
        }
        changes.AddRange(before.Values.SelectMany(q => q).OrderBy(l => l.Kind).ThenBy(l => l.SortOrder)
            .Select(l => new QuoteLineChangeDto(l.Kind, l.Description, QuoteLineChange.Retiree, Snap(l), null)));

        return Ok(new QuoteComparisonDto(
            previous.Id,
            previous.Label,
            Round(previous.Lines.Where(l => l.Counts).Sum(LineTotal)),
            Round(quote.Lines.Where(l => l.Counts).Sum(LineTotal)),
            changes));
    }

    /// <summary>
    /// Keeps this quote's lines (and its description and deposit) as a template to start other
    /// quotes from. A template with the same name is replaced, so saving again updates it.
    /// </summary>
    [HttpPost("{id:guid}/modele")]
    [Authorize(Roles = Roles.Managers)]
    [StaffOnly]
    public async Task<ActionResult<QuoteTemplateDto>> SaveAsTemplate(Guid id, SaveQuoteTemplateRequest request, CancellationToken ct)
    {
        var name = Clean(request.Name);
        if (name is null) return BadRequest(new { message = "Donnez un nom au modèle." });
        if (name.Length > 200) return BadRequest(new { message = "Le nom est limité à 200 caractères." });

        var quote = await db.Quotes.AsNoTracking().Include(q => q.Lines).FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return NotFound();
        if (quote.Lines.Count == 0) return BadRequest(new { message = "Ajoutez des lignes avant d'en faire un modèle." });

        var tenantId = currentUser.TenantId!.Value;
        var existing = await db.QuoteTemplates.Include(t => t.Lines)
            .FirstOrDefaultAsync(t => t.Name.ToLower() == name.ToLower(), ct);
        if (existing is not null)
        {
            db.QuoteTemplateLines.RemoveRange(existing.Lines);
            existing.Lines = [];
        }

        var template = existing ?? new QuoteTemplate { TenantId = tenantId, Name = name };
        template.Name = name;
        template.Description = quote.Description;
        template.DepositPercent = quote.DepositPercent;
        template.UpdatedAt = DateTimeOffset.UtcNow;
        foreach (var l in quote.Lines.OrderBy(l => l.Kind).ThenBy(l => l.SortOrder))
        {
            var line = new QuoteTemplateLine
            {
                TenantId = tenantId,
                TemplateId = template.Id,
                Kind = l.Kind,
                ProductId = l.ProductId,
                Code = l.Code,
                Description = l.Description,
                Unit = l.Unit,
                Quantity = l.Quantity,
                UnitCost = l.UnitCost,
                UnitPrice = l.UnitPrice,
                IsOptional = l.IsOptional,
                SortOrder = l.SortOrder
            };
            if (existing is null) template.Lines.Add(line);
            else db.QuoteTemplateLines.Add(line);
        }
        if (existing is null) db.QuoteTemplates.Add(template);

        await db.SaveChangesAsync(ct);
        return Ok(await db.QuoteTemplates.AsNoTracking().Where(t => t.Id == template.Id)
            .Select(QuoteTemplatesController.ToDto()).FirstAsync(ct));
    }

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

        // Options not taken stay on the quote; the job is what was agreed to.
        var ordered = quote.Lines.Where(l => l.Counts).OrderBy(l => l.SortOrder).ThenBy(l => l.CreatedAt).ToList();
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
        quote.DepositPercent = request.DepositPercent is > 0 ? Math.Round(request.DepositPercent.Value, 2) : null;
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
        line.IsOptional = request.IsOptional;
        line.IsSelected = request.IsOptional && request.IsSelected;
    }

    /// <summary>
    /// Every id from the browser has to be this client's own or this company's own — the same
    /// checks as a project, for the same reason: they are printed on what the client receives.
    /// </summary>
    private async Task<string?> InvalidAsync(UpsertQuoteRequest request)
    {
        if (request.ValidUntil is { } until && request.IssuedOn is { } issued && until < issued)
            return "La date d'échéance précède la date de la soumission.";
        if (request.DepositPercent is < 0 or > 100)
            return "L'acompte est un pourcentage entre 0 et 100.";

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
            LineTotal(l), l.SortOrder, l.IsOptional, l.IsSelected);

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
        q.Lines.Where(l => !l.IsOptional || l.IsSelected).Sum(l => Math.Round(l.Quantity * l.UnitPrice, 2)),
        q.CreatedAt,
        q.UpdatedAt,
        q.SentAt,
        q.ClientRespondedAt,
        q.ClientRespondedBy,
        q.ClientResponseNote,
        q.ClientSignature,
        q.ClientSignaturePng != null,
        q.DepositPercent,
        q.DepositInvoiceId,
        q.DepositInvoice == null ? null : q.DepositInvoice.Number,
        q.Lines.Where(l => l.IsOptional && !l.IsSelected).Sum(l => Math.Round(l.Quantity * l.UnitPrice, 2)),
        q.Lines.Where(l => l.IsOptional)
            .OrderBy(l => l.Kind).ThenBy(l => l.SortOrder)
            .Select(l => new QuoteOptionDto(l.Id, l.Description, Math.Round(l.Quantity * l.UnitPrice, 2), l.IsSelected))
            .ToList(),
        q.Revision,
        q.ReplacesId,
        q.Revisions.OrderByDescending(r => r.Revision).Select(r => (Guid?)r.Id).FirstOrDefault(),
        q.InvoiceId,
        q.Invoice == null ? null : q.Invoice.Number,
        q.ReminderSentAt,
        q.ReminderCount);
}
