using System.IO.Compression;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Auth;
using Vexta.Api.Domain;
using Vexta.Api.Services;
using Vexta.Api.Features.BillingSettings;

namespace Vexta.Api.Features.Invoices;

[ApiController]
[Route("api/invoices")]
// Client is in the list because a customer reads their own projects and invoices here; the
// query filter is what confines them to their own, and [StaffOnly] on every write is what
// stops them changing anything.
[Authorize(Roles = Roles.StaffAndClients)]
[RequireActiveSubscription]
public class InvoicesController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IInvoicePdfService pdf,
    IMailgunService mailgun,
    IR2StorageService storage,
    IHttpClientFactory httpClientFactory) : ControllerBase
{
    /// <summary>
    /// Mailgun refuses a message over about 25 MB, and it refuses the whole of it — the invoice
    /// itself would not go out. Stopped short of that, here, where the answer can name the
    /// problem while the person still has the form open.
    /// </summary>
    private const long MaxAttachmentBytes = 20L * 1024 * 1024;

    /// <summary>
    /// Enough for a long covering letter, and far short of what a paste accident sends. The
    /// body is HTML, so a few thousand characters of text carry more markup than text.
    /// </summary>
    private const int MaxBodyLength = 100_000;

    private const int MaxSubjectLength = 300;

    [HttpGet]
    public async Task<ActionResult<PagedResult<InvoiceDto>>> List(
        [FromQuery] PagingQuery query,
        [FromQuery] Guid? clientId,
        [FromQuery] Guid? projectId,
        [FromQuery] InvoiceStatus? status)
    {
        var invoices = db.Invoices.AsNoTracking().Include(i => i.Lines).AsQueryable();

        if (clientId is not null) invoices = invoices.Where(i => i.ClientId == clientId);
        if (projectId is not null) invoices = invoices.Where(i => i.ProjectId == projectId);
        if (status is not null) invoices = invoices.Where(i => i.Status == status);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = $"%{query.Search.Trim()}%";
            invoices = invoices.Where(i =>
                EF.Functions.ILike(i.Number, pattern) || EF.Functions.ILike(i.Client!.Name, pattern));
        }

        var totalCount = await invoices.CountAsync();

        var entities = await invoices
            .OrderByDescending(i => i.IssueDate).ThenByDescending(i => i.Number)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Include(i => i.Client)
            .Include(i => i.Project)
            .Include(i => i.PricePolicy)
            .ToListAsync();

        var (gst, qst) = await RatesAsync();
        var items = entities.Select(i => ToDto(i, gst, qst)).ToList();

        return Ok(new PagedResult<InvoiceDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<InvoiceDto>> Get(Guid id)
    {
        var invoice = await LoadAsync(id);
        if (invoice is null) return NotFound();

        var (gst, qst) = await RatesAsync();
        return Ok(ToDto(invoice, gst, qst));
    }

    /// <summary>
    /// The invoice as a document: what gets printed, filed and handed to the client. Open to
    /// the customer it belongs to, like the record itself — the query filter is what keeps
    /// them to their own.
    /// </summary>
    [HttpGet("{id:guid}/pdf")]
    public async Task<IActionResult> Pdf(Guid id, CancellationToken ct)
    {
        var number = await db.Invoices.AsNoTracking()
            .Where(i => i.Id == id)
            .Select(i => i.Number)
            .FirstOrDefaultAsync(ct);

        if (number is null) return NotFound();

        var bytes = await pdf.RenderAsync(id, ct);
        if (bytes is null) return NotFound();

        // Inline, not an attachment: this is shown in a viewer beside the form, and a browser
        // that downloads it instead would turn a preview into a folder full of files.
        Response.Headers.ContentDisposition = $"inline; filename=\"Facture-{number}.pdf\"";
        return File(bytes, "application/pdf");
    }

    /// <summary>
    /// The same document, built from an invoice that has not been saved. Staff only, and it
    /// writes nothing — the number it shows is the one the invoice would be given.
    /// </summary>
    [Authorize(Roles = Roles.Managers)]
    [HttpPost("preview")]
    [StaffOnly]
    public async Task<IActionResult> Preview(
        UpsertInvoiceRequest request, [FromQuery] Guid? invoiceId, CancellationToken ct)
    {
        var bytes = await pdf.RenderDraftAsync(request, invoiceId, ct);
        Response.Headers.ContentDisposition = "inline; filename=\"Apercu-facture.pdf\"";
        return File(bytes, "application/pdf");
    }

    /// <summary>
    /// What an invoice for this project would start as: its client, its price policy, its
    /// exemption, and one line per thing the job consumed — materials, hours grouped by the
    /// person who worked them, and expenses that have a selling price.
    ///
    /// Staff only, and it writes nothing. Re-typing onto an invoice what is already recorded on
    /// the job is how hours get lost and materials get billed twice, but the document is still
    /// the company's to check: this fills the form, it does not create anything.
    /// </summary>
    [HttpGet("draft")]
    [StaffOnly]
    public async Task<ActionResult<InvoiceDraftDto>> Draft([FromQuery] Guid projectId, CancellationToken ct)
    {
        var project = await db.Projects.AsNoTracking()
            .Where(p => p.Id == projectId)
            .Select(p => new { p.ClientId, p.IsTaxExempt })
            .FirstOrDefaultAsync(ct);

        if (project is null) return NotFound();

        // The project's exemption decides every line, the same way it does when the invoice is
        // saved: a taxable line on an exempt invoice is a document that contradicts its own total.
        var taxable = !project.IsTaxExempt;

        var hourlyRate = await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == currentUser.TenantId)
            .Select(b => b.DefaultHourlyRate)
            .FirstOrDefaultAsync(ct) ?? 0m;

        var lines = new List<InvoiceDraftLineDto>();

        var materials = await db.ProjectMaterials.AsNoTracking()
            .Where(m => m.ProjectId == projectId)
            .OrderBy(m => m.SortOrder).ThenBy(m => m.CreatedAt)
            .Select(m => new
            {
                m.ProductId, m.Description, m.Unit, m.Quantity,
                m.PurchasePrice, m.MarginPercent, m.UnitPrice
            })
            .ToListAsync(ct);

        lines.AddRange(materials.Select(m => new InvoiceDraftLineDto(
            InvoiceLineKind.Materiaux,
            m.ProductId,
            // The unit travels inside the description, because the invoice has no column for it:
            // "12" of something is a quantity a client can argue with, "12 (pi²)" is not.
            WithUnit(m.Description, m.Unit),
            m.Quantity,
            m.PurchasePrice,
            m.MarginPercent,
            m.UnitPrice,
            taxable)));

        var entries = await db.TimesheetEntries.AsNoTracking()
            .Where(t => t.ProjectId == projectId)
            .OrderBy(t => t.StartDate).ThenBy(t => t.StartTime)
            .Select(t => new
            {
                t.EmployeeId,
                // The two halves, not FullName: that one is a C# property and the database has
                // nothing to compute it with.
                FirstName = t.Employee == null ? null : t.Employee.FirstName,
                LastName = t.Employee == null ? null : t.Employee.LastName,
                t.Hours
            })
            .ToListAsync(ct);

        // One line per person, not per shift. A fortnight of entries printed one by one is a
        // page the client reads as padding, and the total of hours is the same either way.
        // Grouped here rather than in SQL so the order is the order they first appear on the job.
        var byPerson = entries
            .GroupBy(e => e.EmployeeId)
            .Select(g => new { First = g.First(), Hours = g.Sum(e => e.Hours) })
            // Someone with no hours on the job has nothing to bill, and a zero-quantity line is
            // a line the form would refuse to save.
            .Where(g => g.Hours > 0);

        lines.AddRange(byPerson.Select(g => new InvoiceDraftLineDto(
            InvoiceLineKind.MainDOeuvre,
            null,
            LabourDescription(g.First.FirstName, g.First.LastName),
            g.Hours,
            // Nothing to put here: what an hour costs the company is payroll, and it is not a
            // figure that belongs on the client's invoice.
            null,
            null,
            hourlyRate,
            taxable)));

        var expenses = await db.ProjectExpenses.AsNoTracking()
            // Only what has a selling price. An expense filed on site before anyone decided what
            // to charge for it is a receipt, not a line — and zero would bill it as free.
            .Where(e => e.ProjectId == projectId && e.SellingPrice != null)
            .OrderBy(e => e.SpentOn).ThenBy(e => e.CreatedAt)
            .Select(e => new { e.Name, e.Cost, e.SellingPrice })
            .ToListAsync(ct);

        lines.AddRange(expenses.Select(e => new InvoiceDraftLineDto(
            InvoiceLineKind.FraisSupplementaires,
            null,
            e.Name.Trim(),
            // One of it, whatever it was: an expense is a thing that was paid for once.
            1m,
            e.Cost,
            null,
            e.SellingPrice!.Value,
            taxable)));

        return Ok(new InvoiceDraftDto(
            project.ClientId,
            await DefaultPolicyAsync(projectId),
            project.IsTaxExempt,
            lines));
    }

    /// <summary>
    /// What the send form opens with: the addresses this invoice can go to, the employees who
    /// can be put in copy, the company's own wording filled in with this invoice's figures, and
    /// the documents of its project.
    ///
    /// Staff only, and it writes nothing. The subject and the body come back rendered rather
    /// than as templates, so what the person reads before pressing Send is the message that
    /// leaves — see <see cref="InvoiceEmailTemplate"/>, which both screens render through.
    /// </summary>
    [HttpGet("{id:guid}/send-defaults")]
    [StaffOnly]
    public async Task<ActionResult<InvoiceSendDefaultsDto>> SendDefaults(Guid id, CancellationToken ct)
    {
        var invoice = await db.Invoices.AsNoTracking()
            .Include(i => i.Client)
            .Include(i => i.Project)
            .Include(i => i.PricePolicy)
            .Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == id, ct);

        if (invoice is null) return NotFound();

        var recipients = await RecipientsAsync(invoice, ct);

        var employees = await db.Employees.AsNoTracking()
            // An employee with no address cannot be put in copy, and offering them is offering a
            // choice that fails at the last step.
            .Where(e => e.Email != "")
            .OrderBy(e => e.FirstName).ThenBy(e => e.LastName)
            // FirstName and LastName rather than FullName: that one is a C# property and the
            // database has nothing to compute it with.
            .Select(e => new InvoiceRecipientDto(e.Id, e.FirstName + " " + e.LastName, e.Email, e.JobTitle))
            .ToListAsync(ct);

        var documents = invoice.ProjectId is { } projectId
            ? await db.ProjectDocuments.AsNoTracking()
                .Where(d => d.ProjectId == projectId)
                .OrderByDescending(d => d.CreatedAt)
                // The original size, not what the bucket holds: a file the browser gzipped before
                // uploading travels in the email at its full weight, and that is the figure the
                // person needs when they are deciding what fits.
                .Select(d => new InvoiceAttachmentOptionDto(
                    d.Id, d.Title, d.MediaAsset!.FileName, d.MediaAsset!.OriginalSizeBytes))
                .ToListAsync(ct)
            : [];

        var (gst, qst) = await RatesAsync(ct);
        var values = await TemplateValuesAsync(
            ToDto(invoice, gst, qst), invoice.TenantId, recipients.FirstOrDefault()?.Name, ct);

        var settings = await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == invoice.TenantId)
            .Select(b => new { b.InvoiceEmailSubject, b.InvoiceEmailBody })
            .FirstOrDefaultAsync(ct);

        return Ok(new InvoiceSendDefaultsDto(
            recipients.FirstOrDefault()?.Email,
            // The subject is plain text and must not arrive carrying &amp;; the body is HTML and
            // must. That flag is the whole difference between the two calls.
            InvoiceEmailTemplate.Render(
                Template(settings?.InvoiceEmailSubject) ?? InvoiceEmailTemplate.DefaultSubject,
                values,
                escapeHtml: false),
            InvoiceEmailTemplate.Render(
                Template(settings?.InvoiceEmailBody) ?? InvoiceEmailTemplate.DefaultBody,
                values,
                escapeHtml: true),
            recipients,
            employees,
            documents));
    }

    /// <summary>
    /// Emails the invoice with the PDF attached, to the address the form was filled in with, and
    /// marks it sent.
    ///
    /// The status moves only once Mailgun has accepted the message. An invoice that says
    /// "Envoyée" because a button was pressed is worse than no status at all: it is the record
    /// someone checks before chasing a payment that was never asked for.
    /// </summary>
    [Authorize(Roles = Roles.Managers)]
    [HttpPost("{id:guid}/send")]
    [StaffOnly]
    public async Task<ActionResult<InvoiceSentDto>> Send(Guid id, SendInvoiceRequest request, CancellationToken ct)
    {
        var invoice = await db.Invoices
            .Include(i => i.Client)
            .FirstOrDefaultAsync(i => i.Id == id, ct);

        if (invoice is null) return NotFound();

        if (invoice.Status == InvoiceStatus.Annulee)
        {
            return BadRequest(new { message = "Cette facture est annulée. Elle ne peut pas être envoyée." });
        }

        // Checked here and not only in the form. The browser is where the address was typed, not
        // where it gets to be trusted: an empty one sends the invoice nowhere and still records
        // it as sent, and a malformed one is refused by Mailgun with its own English wording.
        var to = request.To?.Trim();
        if (string.IsNullOrWhiteSpace(to))
        {
            return BadRequest(new { message = "Indiquez l'adresse courriel du destinataire." });
        }

        if (!IsEmailAddress(to))
        {
            return BadRequest(new { message = $"« {to} » n'est pas une adresse courriel valide." });
        }

        var subject = request.Subject?.Trim() ?? string.Empty;
        if (subject.Length == 0)
        {
            return BadRequest(new { message = "Le courriel a besoin d'un sujet." });
        }

        if (subject.Length > MaxSubjectLength)
        {
            return BadRequest(new
            {
                message = $"Le sujet dépasse {MaxSubjectLength} caractères. Un sujet plus court est aussi plus lisible dans une boîte de réception."
            });
        }

        // The body is accepted as HTML and not scrubbed: it is written by a member of staff for
        // their own client, and stripping their formatting would be answering a problem nobody
        // has. What it must not do is grow without limit, and the values this message quotes are
        // escaped where they are filled in, by InvoiceEmailTemplate.
        var body = request.Body?.Trim() ?? string.Empty;
        if (body.Length == 0)
        {
            return BadRequest(new { message = "Le courriel a besoin d'un message." });
        }

        if (body.Length > MaxBodyLength)
        {
            return BadRequest(new { message = "Le message est trop long. Mettez le reste en pièce jointe." });
        }

        // The copy is built from ids and the addresses are read back from the employee records.
        // Accepting addresses as given would make this endpoint an open mail relay for anyone
        // with an account here: they could post any address and have it receive a message from
        // the company's own sending domain, with files attached.
        var ccIds = request.CcEmployeeIds?.Distinct().ToList() ?? [];
        var cc = ccIds.Count == 0
            ? []
            : await db.Employees.AsNoTracking()
                // The tenant filter does the rest: an id from another company matches nothing.
                .Where(e => ccIds.Contains(e.Id) && e.Email != "")
                .Select(e => e.Email)
                .ToListAsync(ct);

        var pdfBytes = await pdf.RenderAsync(id, ct);
        if (pdfBytes is null) return NotFound();

        // Always first, and never optional: the message exists to deliver this document.
        var attachments = new List<EmailAttachment>
        {
            new($"Facture-{invoice.Number}.pdf", "application/pdf", pdfBytes)
        };

        var extras = await AttachmentSourcesAsync(invoice, request, ct);
        if (extras.Error is { } attachmentError)
        {
            return BadRequest(new { message = attachmentError });
        }

        var total = (long)pdfBytes.Length;

        foreach (var file in extras.Files)
        {
            byte[] content;
            try
            {
                content = await ReadFromStorageAsync(file.ObjectKey, file.FileName, file.ContentEncoding, ct);
            }
            catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = $"Impossible de lire « {file.FileName} » dans le stockage de fichiers. {ex.Message}"
                });
            }

            total += content.Length;

            // Checked as the files are read rather than once at the end, so a careless selection
            // of very large documents is stopped before all of it has been pulled out of R2.
            if (total > MaxAttachmentBytes)
            {
                return BadRequest(new
                {
                    message = $"Les pièces jointes dépassent {MaxAttachmentBytes / (1024 * 1024)} Mo, la limite de notre service d'envoi. "
                        + "Retirez-en, ou envoyez les plus gros fichiers par un lien de téléchargement."
                });
            }

            attachments.Add(new EmailAttachment(file.FileName, file.ContentType, content));
        }

        try
        {
            await mailgun.SendWithAttachmentsAsync(
                to,
                await DisplayNameAsync(invoice, to, ct),
                subject,
                body,
                cc,
                attachments,
                ct,
                // An invoice arrives from the company that issued it. Read from the tenant rather
                // than from the token: a super admin inside a company sends on its behalf, and the
                // client has no idea who we are.
                await db.Tenants.IgnoreQueryFilters().AsNoTracking()
                    .Where(t => t.Id == currentUser.TenantId)
                    .Select(t => t.Name)
                    .FirstOrDefaultAsync(ct));
        }
        catch (InvalidOperationException ex)
        {
            // Mailgun's own words, which say which field is wrong. Swallowing them here would
            // leave the company guessing why nothing arrived — and the invoice stays as it was,
            // because nothing was delivered.
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }

        invoice.SentAt = DateTimeOffset.UtcNow;

        // A paid invoice that is sent again stays paid: the status says where the money is, and
        // re-sending a copy does not unmake a payment.
        if (invoice.Status is InvoiceStatus.Brouillon or InvoiceStatus.Envoyee)
        {
            invoice.Status = InvoiceStatus.Envoyee;
        }

        invoice.UpdatedAt = DateTimeOffset.UtcNow;

        // The invoice has left, so the job it belongs to is billed. Written in the same save as
        // the status above, because the two are one event: a project left behind would be a
        // chantier still reading "À facturer" with its invoice already in a client's inbox.
        await MarkProjectInvoicedAsync(invoice.ProjectId, invoice.Status);

        await db.SaveChangesAsync(ct);

        return Ok(new InvoiceSentDto(to, invoice.SentAt.Value, invoice.Status));
    }

    // Reading is open to the customer this record belongs to — the query filter already
    // narrows it to theirs. Writing is not: a client does not raise their own invoice, and
    // "they can only see their own" is not the same promise as "they can change it".
    [Authorize(Roles = Roles.Managers)]
    [HttpPost]
    [StaffOnly]
    [RequireBusinessTenant]
    public async Task<ActionResult<InvoiceDto>> Create(UpsertInvoiceRequest request)
    {
        var client = await db.Clients.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.ClientId);
        if (client is null) return BadRequest(new { message = "Client introuvable." });

        // Only a new invoice, and only for a barred client. Work already done still gets billed:
        // barring somebody is a decision about the future, not a reason to hand over labour for
        // free. What it stops is a new document going out to a client the company has closed.
        if (client.WorkRefusal() is { } refusal) return BadRequest(new { message = refusal });

        if (LineProblem(request) is { } lineError) return BadRequest(new { message = lineError });

        var exempt = await ExemptionAsync(request);

        var tenantId = currentUser.TenantId!.Value;

        // An invoice is a legal document. Its number, its tax rates and its payment terms are
        // the company's to decide, and inventing them on their behalf would put wrong figures
        // on something a client pays against.
        var settings = await db.BillingSettings.FirstOrDefaultAsync(b => b.TenantId == tenantId);
        if (settings is null)
        {
            return BadRequest(new
            {
                message = "Remplissez les paramètres de facturation avant de créer une facture."
            });
        }

        var invoice = new Invoice
        {
            TenantId = tenantId,
            Number = InvoiceNumbering.Format(settings.InvoicePrefix, settings.NextInvoiceNumber),
            ClientId = request.ClientId,
            ProjectId = request.ProjectId,
            Status = request.Status,
            IssueDate = request.IssueDate,
            DueDate = request.DueDate,
            // The company's currency, read once here and then the invoice's own. It is not asked
            // for on the form: a company bills in one currency, and an invoice that was issued in
            // it must keep saying so after the company changes the setting.
            Currency = CurrencyOf(settings),
            Notes = request.Notes,
            IsTaxExempt = exempt,
            PricePolicyId = request.PricePolicyId ?? await DefaultPolicyAsync(request.ProjectId),
            Lines = ToLineEntities(request.Lines, exempt)
        };

        // Advanced here, not derived from a count: deleting an invoice must never hand its
        // number to the next one.
        settings.NextInvoiceNumber++;

        db.Invoices.Add(invoice);

        // In the same SaveChanges as the invoice: the project is billed because this document
        // exists, so the two facts are written together or not at all.
        await MarkProjectInvoicedAsync(invoice.ProjectId, invoice.Status);

        await db.SaveChangesAsync();

        var created = await LoadAsync(invoice.Id);
        var (gst, qst) = await RatesAsync();
        return CreatedAtAction(nameof(Get), new { id = invoice.Id }, ToDto(created!, gst, qst));
    }

    [Authorize(Roles = Roles.Managers)]
    [HttpPut("{id:guid}")]
    [StaffOnly]
    public async Task<ActionResult<InvoiceDto>> Update(Guid id, UpsertInvoiceRequest request)
    {
        var invoice = await db.Invoices.Include(i => i.Lines).FirstOrDefaultAsync(i => i.Id == id);
        if (invoice is null) return NotFound();

        if (LineProblem(request) is { } lineError) return BadRequest(new { message = lineError });

        invoice.ClientId = request.ClientId;
        invoice.ProjectId = request.ProjectId;
        invoice.Status = request.Status;
        invoice.IssueDate = request.IssueDate;
        invoice.DueDate = request.DueDate;
        // The stored currency is deliberately left alone. An invoice is a document that has been
        // issued in a currency; a company that changes its setting next year must not thereby
        // restate what a client already received — and the form no longer offers the field.
        invoice.Notes = request.Notes;
        invoice.IsTaxExempt = request.IsTaxExempt ?? invoice.IsTaxExempt;
        invoice.PricePolicyId = request.PricePolicyId ?? invoice.PricePolicyId;
        invoice.UpdatedAt = DateTimeOffset.UtcNow;

        db.InvoiceLines.RemoveRange(invoice.Lines);

        // Added through the DbSet rather than onto the parent's collection, which looks like a
        // detail and is not: these rows carry a client-generated Guid key, and EF reads a key
        // that is already set as "this row exists". Reached through a navigation it was marked
        // Modified instead of Added, so the save issued an UPDATE for a line that had never
        // been inserted — nought rows affected, and the whole request failed with a
        // concurrency error. Add() states the intent and leaves nothing to infer.
        var replacements = ToLineEntities(request.Lines, invoice.IsTaxExempt);
        foreach (var line in replacements) line.InvoiceId = invoice.Id;
        db.InvoiceLines.AddRange(replacements);

        // Also on an edit: an invoice can be attached to its project after the fact, and a
        // project that is only now being pointed at is a project that is only now billed.
        await MarkProjectInvoicedAsync(invoice.ProjectId, invoice.Status);

        await db.SaveChangesAsync();

        var updated = await LoadAsync(id);
        var (gst, qst) = await RatesAsync();
        return Ok(ToDto(updated!, gst, qst));
    }

    [Authorize(Roles = Roles.Managers)]
    [HttpDelete("{id:guid}")]
    [StaffOnly]
    public async Task<IActionResult> Delete(Guid id)
    {
        var invoice = await db.Invoices.FirstOrDefaultAsync(i => i.Id == id);
        if (invoice is null) return NotFound();

        db.Invoices.Remove(invoice);
        await db.SaveChangesAsync();
        return NoContent();
    }



    /// <summary>
    /// A file in R2 that is about to be attached, whatever row pointed at it.
    /// </summary>
    private record StoredFile(string ObjectKey, string FileName, string ContentType, string? ContentEncoding);

    /// <summary>
    /// Everybody this invoice can be addressed to: the address on the client's own file first,
    /// then every contact there who has one.
    ///
    /// The client's file comes first because it is the address the company put on the account,
    /// and a contact is the exception somebody chose to add.
    /// </summary>
    private async Task<List<InvoiceRecipientDto>> RecipientsAsync(Invoice invoice, CancellationToken ct)
    {
        var recipients = new List<InvoiceRecipientDto>();

        if (invoice.Client?.Email?.Trim() is { Length: > 0 } clientEmail)
        {
            recipients.Add(new InvoiceRecipientDto(null, invoice.Client.Name, clientEmail, "Fiche du client"));
        }

        var contacts = await db.ClientContacts.AsNoTracking()
            .Where(c => c.ClientId == invoice.ClientId && c.Email != null && c.Email != "")
            .OrderBy(c => c.FirstName).ThenBy(c => c.LastName)
            .Select(c => new { c.Id, c.FirstName, c.LastName, c.Role, c.Email })
            .ToListAsync(ct);

        recipients.AddRange(contacts.Select(c => new InvoiceRecipientDto(
            c.Id,
            $"{c.FirstName} {c.LastName}".Trim(),
            c.Email!.Trim(),
            // Their title where they have one. "Contact" would be the screen telling the person
            // something they can already see from the list they are reading.
            string.IsNullOrWhiteSpace(c.Role) ? null : c.Role.Trim())));

        return recipients;
    }

    /// <summary>
    /// The name the message is addressed to, found from the address it is going to: the client,
    /// one of its contacts, or the address itself when it belongs to neither — which is what a
    /// contact created in the send form looks like before the list is refetched.
    /// </summary>
    private async Task<string> DisplayNameAsync(Invoice invoice, string to, CancellationToken ct)
    {
        if (string.Equals(invoice.Client?.Email?.Trim(), to, StringComparison.OrdinalIgnoreCase))
        {
            return invoice.Client!.Name;
        }

        var contact = await db.ClientContacts.AsNoTracking()
            .Where(c => c.ClientId == invoice.ClientId && c.Email != null)
            // ILike, not Contains or ToLower: on Postgres an ordinary string comparison is case
            // sensitive, and an address typed in capitals is the same address.
            .Where(c => EF.Functions.ILike(c.Email!, to))
            .Select(c => c.FirstName + " " + c.LastName)
            .FirstOrDefaultAsync(ct);

        return string.IsNullOrWhiteSpace(contact) ? to : contact.Trim();
    }

    /// <summary>
    /// The files to attach beyond the invoice itself, each checked against what the sender is
    /// actually allowed to attach, or a French reason why none of it will be sent.
    ///
    /// Two separate checks, because the two lists are abused in two different ways. A media
    /// asset only has to belong to this tenant, which the query filter settles. A project
    /// document has to belong to <em>this invoice's project</em>: tenant alone would turn the
    /// send form into a way of reading another job's plans by guessing at ids.
    /// </summary>
    private async Task<(string? Error, List<StoredFile> Files)> AttachmentSourcesAsync(
        Invoice invoice, SendInvoiceRequest request, CancellationToken ct)
    {
        var files = new List<StoredFile>();

        var mediaIds = request.MediaAssetIds?.Distinct().ToList() ?? [];
        if (mediaIds.Count > 0)
        {
            var assets = await db.MediaAssets.AsNoTracking()
                .Where(a => mediaIds.Contains(a.Id))
                .Select(a => new StoredFile(a.ObjectKey, a.FileName, a.ContentType, a.ContentEncoding))
                .ToListAsync(ct);

            if (assets.Count != mediaIds.Count)
            {
                return ("Une des pièces jointes est introuvable. Téléversez-la de nouveau.", files);
            }

            files.AddRange(assets);
        }

        var documentIds = request.ProjectDocumentIds?.Distinct().ToList() ?? [];
        if (documentIds.Count == 0) return (null, files);

        if (invoice.ProjectId is not { } projectId)
        {
            return ("Cette facture n'est rattachée à aucun projet : elle ne peut pas porter de document de projet.", files);
        }

        var documents = await db.ProjectDocuments.AsNoTracking()
            .Where(d => documentIds.Contains(d.Id) && d.ProjectId == projectId)
            .Select(d => new StoredFile(
                d.MediaAsset!.ObjectKey, d.MediaAsset!.FileName, d.MediaAsset!.ContentType, d.MediaAsset!.ContentEncoding))
            .ToListAsync(ct);

        if (documents.Count != documentIds.Count)
        {
            return ("Un des documents choisis n'appartient pas au projet de cette facture.", files);
        }

        files.AddRange(documents);
        return (null, files);
    }

    /// <summary>
    /// The bytes of a stored file, read through a short-lived signed URL.
    ///
    /// The storage service hands out URLs, not bytes, and this is the one place that needs the
    /// bytes themselves: an attachment travels with the message, so a link the recipient would
    /// have to be signed in to open is not an attachment at all.
    /// </summary>
    private async Task<byte[]> ReadFromStorageAsync(
        string objectKey, string fileName, string? contentEncoding, CancellationToken ct)
    {
        var url = await storage.CreateDownloadUrlAsync(objectKey, fileName, ct);

        using var client = httpClientFactory.CreateClient();
        using var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var bytes = await response.Content.ReadAsByteArrayAsync(ct);

        // A file the browser gzipped before uploading is stored gzipped, and nothing above asked
        // for it to be inflated. Both the recorded encoding and the gzip magic number have to
        // agree before anything is touched: a .gz the person uploaded as a file is not an
        // encoding, and an object a public bucket already inflated must be left alone.
        if (!string.Equals(contentEncoding, "gzip", StringComparison.OrdinalIgnoreCase)) return bytes;
        if (bytes is not [0x1f, 0x8b, ..]) return bytes;

        using var source = new MemoryStream(bytes);
        using var gzip = new GZipStream(source, CompressionMode.Decompress);
        using var inflated = new MemoryStream();
        await gzip.CopyToAsync(inflated, ct);
        return inflated.ToArray();
    }

    /// <summary>
    /// The fields the email template is filled in with, for this invoice. Dates are written the
    /// way the settings preview writes them, so the two never quote the same due date two ways.
    /// </summary>
    private async Task<IReadOnlyDictionary<string, string>> TemplateValuesAsync(
        InvoiceDto invoice, Guid tenantId, string? contactName, CancellationToken ct)
    {
        var company = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(ct) ?? "Votre fournisseur";

        return new Dictionary<string, string>
        {
            ["numero"] = invoice.Number,
            ["entreprise"] = company,
            ["client"] = invoice.ClientName,
            // The client's own name when the invoice goes to their file rather than to a person:
            // "Bonjour," followed by nothing is worse than being greeted by the company name.
            ["contact"] = string.IsNullOrWhiteSpace(contactName) ? invoice.ClientName : contactName,
            ["projet"] = invoice.ProjectNumber is { } number ? $"P-{number:0000}" : string.Empty,
            ["total"] = InvoiceEmailTemplate.Money(invoice.Total),
            ["sous_total"] = InvoiceEmailTemplate.Money(invoice.Subtotal),
            ["taxes"] = InvoiceEmailTemplate.Money(invoice.TaxTotal),
            ["date_emission"] = invoice.IssueDate.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            ["date_echeance"] = invoice.DueDate.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            ["devise"] = invoice.Currency
        };
    }

    /// <summary>
    /// A stored template, or null for "the company never wrote one" — which is also what a row
    /// of whitespace means, and which is the signal to use the built-in wording.
    /// </summary>
    private static string? Template(string? stored) =>
        string.IsNullOrWhiteSpace(stored) ? null : stored;

    /// <summary>
    /// An address, and nothing else. <c>MailAddress</c> happily parses "Jean &lt;a@b.ca&gt;",
    /// so the parsed address has to come back identical to what was sent — a display name in
    /// this field is a header someone is trying to write by hand.
    /// </summary>
    private static bool IsEmailAddress(string value) =>
        System.Net.Mail.MailAddress.TryCreate(value, out var parsed)
        && string.Equals(parsed.Address, value, StringComparison.OrdinalIgnoreCase)
        && parsed.Host.Contains('.');

    /// <summary>
    /// The description a material carries onto the invoice, with its unit when it has one:
    /// "Contreplaqué 3/4 (pi²)".
    /// </summary>
    private static string WithUnit(string description, string? unit)
    {
        var text = description.Trim();
        return string.IsNullOrWhiteSpace(unit) ? text : $"{text} ({unit.Trim()})";
    }

    /// <summary>
    /// "Main-d'œuvre — Jean Tremblay", or the plain "Main-d'œuvre" for someone who has since
    /// been taken off the payroll (<c>EmployeeId</c> is SetNull, so the hours outlive the
    /// employee record). Neutral on purpose: this line is read by the client, and explaining
    /// our payroll to them is answering a question they never asked.
    /// </summary>
    private static string LabourDescription(string? firstName, string? lastName)
    {
        var name = $"{firstName} {lastName}".Trim();
        return string.IsNullOrWhiteSpace(name) ? "Main-d'œuvre" : $"Main-d'œuvre — {name}";
    }

    /// <summary>
    /// The company's currency as an invoice stores it. Defaulted rather than refused: a blank
    /// here is a settings row saved before the field existed, not a decision to bill in nothing.
    /// </summary>
    private static string CurrencyOf(Domain.BillingSettings settings) =>
        string.IsNullOrWhiteSpace(settings.Currency) ? "CAD" : settings.Currency.Trim().ToUpperInvariant();

    /// <summary>
    /// Sending an invoice is what marks the job billed — nobody comes back to a status list to
    /// say so, which is the whole reason <see cref="ProjectStatus.Facture"/> exists.
    ///
    /// A draft does not count, and that is the point: a draft is a document being prepared, and
    /// preparing it freezes nothing. The job is billed when the invoice has left — which also
    /// means the figures behind it are now the ones a client is holding, and that is exactly the
    /// moment they must stop moving.
    ///
    /// Tracks the project rather than issuing an UPDATE, so it is saved with the invoice.
    /// </summary>
    private async Task MarkProjectInvoicedAsync(Guid? projectId, InvoiceStatus invoiceStatus)
    {
        if (projectId is not { } id) return;

        // Sent, paid or overdue: all three say the invoice is out. A draft says it is not, and a
        // cancelled one says a billing was undone — neither tells the job it has been charged.
        if (invoiceStatus is not (InvoiceStatus.Envoyee or InvoiceStatus.Payee or InvoiceStatus.EnRetard))
        {
            return;
        }

        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return;

        // A cancelled job stays cancelled. A cancellation fee is still invoiced, and bringing
        // the project back to life over it would put a dead job back in front of the crew.
        if (project.Status is ProjectStatus.Annule or ProjectStatus.Facture) return;

        project.Status = ProjectStatus.Facture;
        project.UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>What an invoice may not be saved without. The preview is allowed both.</summary>
    private static string? LineProblem(UpsertInvoiceRequest request)
    {
        if (request.Lines.Count == 0) return "Ajoutez au moins une ligne à la facture.";
        if (request.Lines.Any(l => string.IsNullOrWhiteSpace(l.Description)))
            return "Chaque ligne a besoin d'une description.";

        return null;
    }

    /// <summary>
    /// The policy a new invoice starts with: the project's, and otherwise the company's
    /// default. Stored on the invoice so a price stays explainable after the policy moves.
    /// </summary>
    private async Task<Guid?> DefaultPolicyAsync(Guid? projectId)
    {
        if (projectId is { } id)
        {
            var fromProject = await db.Projects.AsNoTracking()
                .Where(p => p.Id == id)
                .Select(p => p.PricePolicyId)
                .FirstOrDefaultAsync();

            if (fromProject is not null) return fromProject;
        }

        return await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == currentUser.TenantId)
            .Select(b => b.DefaultPricePolicyId)
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// Where an exempt invoice comes from when the request does not say: the project it belongs
    /// to, and otherwise the client. The exemption is the client's, but a job can be the
    /// exception, so the project's answer wins whenever there is one.
    /// </summary>
    private async Task<bool> ExemptionAsync(UpsertInvoiceRequest request)
    {
        if (request.IsTaxExempt is { } stated) return stated;

        if (request.ProjectId is { } projectId)
        {
            var project = await db.Projects.AsNoTracking()
                .Where(p => p.Id == projectId)
                .Select(p => new { p.IsTaxExempt })
                .FirstOrDefaultAsync();

            if (project is not null) return project.IsTaxExempt;
        }

        return await db.Clients.AsNoTracking()
            .Where(c => c.Id == request.ClientId)
            .Select(c => c.IsTaxExempt)
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// The rate is forced to zero on an exempt invoice rather than trusted from the request.
    /// A stored line that still carries 9.975 on an invoice printed without tax is a document
    /// whose own total contradicts it, and it is the stored lines that get re-totalled later.
    /// </summary>
    private static List<InvoiceLine> ToLineEntities(List<InvoiceLineRequest> lines, bool isTaxExempt) => lines
        .Select((l, index) => new InvoiceLine
        {
            Kind = l.Kind,
            ProductId = l.ProductId,
            Description = l.Description?.Trim() ?? string.Empty,
            Quantity = l.Quantity,
            PurchasePrice = l.PurchasePrice,
            MarginPercent = l.MarginPercent,
            UnitPrice = l.UnitPrice,
            // Forced, not trusted: a line that still claims to be taxable on an invoice printed
            // without tax is a document whose own total contradicts it.
            IsTaxable = !isTaxExempt && l.IsTaxable,
            SortOrder = index
        })
        .ToList();

    private Task<Invoice?> LoadAsync(Guid id) => db.Invoices
        .Include(i => i.Client)
        .Include(i => i.Project)
        .Include(i => i.PricePolicy)
        .Include(i => i.Lines.OrderBy(l => l.SortOrder))
        .FirstOrDefaultAsync(i => i.Id == id);

    /// <summary>
    /// The two rates an invoice is taxed with. They belong to the company, so they are read
    /// once per request rather than carried on every line.
    /// </summary>
    private async Task<(decimal Gst, decimal Qst)> RatesAsync(CancellationToken ct = default)
    {
        var settings = await db.BillingSettings.AsNoTracking()
            .Where(b => b.TenantId == currentUser.TenantId)
            .Select(b => new { b.GstRate, b.QstRate })
            .FirstOrDefaultAsync(ct);

        return (settings?.GstRate ?? 0m, settings?.QstRate ?? 0m);
    }

    internal static string RateLabel(string name, decimal rate) =>
        $"{name} ({rate.ToString("0.###", Formats.Quebec)} %)";

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static InvoiceDto ToDto(Invoice invoice, decimal gstRate, decimal qstRate)
    {
        var lines = invoice.Lines.OrderBy(l => l.SortOrder)
            .Select(l => new InvoiceLineDto(
                l.Id, l.Kind, l.ProductId, l.Description, l.Quantity,
                l.PurchasePrice, l.MarginPercent, l.UnitPrice, l.IsTaxable, l.SortOrder))
            .ToList();

        // The same arithmetic the PDF uses, which is the point of InvoiceTotals: the screen
        // used to sum the raw amounts and round once while the paper rounded each line, so the
        // same invoice could read a cent apart in the two places.
        var totals = InvoiceTotals.For(invoice.Lines, gstRate, qstRate, invoice.IsTaxExempt);

        return new InvoiceDto(
            invoice.Id, invoice.Number, invoice.ClientId, invoice.Client?.Name ?? string.Empty,
            invoice.ProjectId, invoice.Project?.Number,
            invoice.Status, invoice.IssueDate, invoice.DueDate, invoice.Currency, invoice.Notes,
            invoice.IsTaxExempt, invoice.PricePolicyId, invoice.PricePolicy?.Name, invoice.SentAt,
            totals.Subtotal,
            RateLabel("TPS", gstRate), totals.Gst,
            RateLabel("TVQ", qstRate), totals.Qst,
            totals.TaxTotal, totals.Total,
            lines, invoice.CreatedAt, invoice.UpdatedAt);
    }
}
