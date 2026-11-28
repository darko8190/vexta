using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Invoices;
using Vexta.Api.Features.Sends;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Clients;

/// <summary>One movement on the statement: an invoice, a payment, a credit note, a refund.</summary>
public record StatementLineDto(DateOnly Date, string Kind, string Reference, string Description, decimal Debit, decimal Credit, decimal Balance);

/// <summary>An invoice still owed on the statement's last day, and how late it is.</summary>
public record StatementOpenInvoiceDto(Guid Id, string Number, DateOnly IssueDate, DateOnly DueDate, decimal Total, decimal Balance, int DaysLate);

/// <summary>
/// What a client owes and how it got there over a period: the balance carried in, every movement
/// in the period with the running balance, the balance carried out, and the invoices still open.
/// </summary>
public record ClientStatementDto(
    Guid ClientId,
    string ClientName,
    string? ClientEmail,
    DateOnly From,
    DateOnly To,
    decimal OpeningBalance,
    IReadOnlyList<StatementLineDto> Lines,
    decimal ClosingBalance,
    IReadOnlyList<StatementOpenInvoiceDto> OpenInvoices,
    decimal Current,
    decimal Late1To30,
    decimal Late31To60,
    decimal LateOver60);

/// <summary>
/// The arithmetic of a client's statement, from the invoices themselves: an invoice is owed
/// once it has left (drafts and cancelled ones never are), a payment or a credit note reduces
/// what is owed, a refund puts it back. The same rules as the invoice screens, so the statement
/// and the invoice list never disagree on a balance.
/// </summary>
public static class ClientStatements
{
    public static (DateOnly From, DateOnly To) Period(DateOnly? from, DateOnly? to)
    {
        var end = to ?? BusinessDay.Today;
        // Three months by default, from the first of the month: what a monthly statement covers
        // with enough behind it to see a payment arrive.
        var start = from ?? new DateOnly(end.Year, end.Month, 1).AddMonths(-2);
        return start > end ? (end, end) : (start, end);
    }

    public static async Task<ClientStatementDto?> BuildAsync(
        VextaDbContext db, Guid tenantId, Guid clientId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var client = await db.Clients.AsNoTracking()
            .Where(c => c.Id == clientId)
            .Select(c => new { c.Id, c.Name, c.Email })
            .FirstOrDefaultAsync(ct);
        if (client is null) return null;

        var settings = await db.BillingSettings.AsNoTracking().FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);

        var invoices = await db.Invoices.AsNoTracking()
            .Include(i => i.Lines)
            .Where(i => i.ClientId == clientId && i.Status != InvoiceStatus.Brouillon && i.Status != InvoiceStatus.Annulee
                && i.IssueDate <= to)
            .ToListAsync(ct);
        var ids = invoices.Select(i => i.Id).ToList();
        var totals = invoices.ToDictionary(i => i.Id, i => InvoiceTotals.For(i.Lines, settings, i.IsTaxExempt).Total);
        var numbers = invoices.ToDictionary(i => i.Id, i => i.Number);

        var payments = await db.InvoicePayments.AsNoTracking()
            .Where(p => ids.Contains(p.InvoiceId) && p.Date <= to)
            .Select(p => new { p.InvoiceId, p.Date, p.Amount, p.Reference })
            .ToListAsync(ct);
        var credits = await db.InvoiceCredits.AsNoTracking()
            .Where(c => ids.Contains(c.InvoiceId) && c.Date <= to)
            .Select(c => new { c.InvoiceId, c.Date, c.Amount })
            .ToListAsync(ct);
        var refunds = await db.InvoiceRefunds.AsNoTracking()
            .Where(r => ids.Contains(r.InvoiceId) && r.Date <= to)
            .Select(r => new { r.InvoiceId, r.Date, r.Amount, r.Reference })
            .ToListAsync(ct);

        // Every movement, signed: positive is what the client owes more of.
        var moves = new List<(DateOnly Date, int Order, string Kind, string Reference, string Description, decimal Amount)>();
        foreach (var invoice in invoices)
            moves.Add((invoice.IssueDate, 0, "Facture", invoice.Number,
                $"Facture {invoice.Number} — échéance {invoice.DueDate:yyyy-MM-dd}", totals[invoice.Id]));
        foreach (var p in payments)
            moves.Add((p.Date, 1, "Paiement", numbers[p.InvoiceId],
                string.IsNullOrWhiteSpace(p.Reference) ? $"Paiement — facture {numbers[p.InvoiceId]}" : $"Paiement {p.Reference} — facture {numbers[p.InvoiceId]}",
                -p.Amount));
        foreach (var c in credits)
            moves.Add((c.Date, 2, "Crédit", numbers[c.InvoiceId], $"Note de crédit — facture {numbers[c.InvoiceId]}", -c.Amount));
        foreach (var r in refunds)
            moves.Add((r.Date, 3, "Remboursement", numbers[r.InvoiceId], $"Remboursement — facture {numbers[r.InvoiceId]}", r.Amount));

        var opening = Round(moves.Where(m => m.Date < from).Sum(m => m.Amount));
        var running = opening;
        var lines = new List<StatementLineDto>();
        foreach (var m in moves.Where(m => m.Date >= from).OrderBy(m => m.Date).ThenBy(m => m.Order).ThenBy(m => m.Reference))
        {
            running = Round(running + m.Amount);
            lines.Add(new StatementLineDto(m.Date, m.Kind, m.Reference, m.Description,
                m.Amount > 0 ? Round(m.Amount) : 0m, m.Amount < 0 ? Round(-m.Amount) : 0m, running));
        }

        // What each invoice still owes on the last day.
        var open = invoices
            .Select(i =>
            {
                var balance = Round(totals[i.Id]
                    - payments.Where(p => p.InvoiceId == i.Id).Sum(p => p.Amount)
                    - credits.Where(c => c.InvoiceId == i.Id).Sum(c => c.Amount)
                    + refunds.Where(r => r.InvoiceId == i.Id).Sum(r => r.Amount));
                return new StatementOpenInvoiceDto(i.Id, i.Number, i.IssueDate, i.DueDate, totals[i.Id], balance,
                    Math.Max(0, to.DayNumber - i.DueDate.DayNumber));
            })
            .Where(i => i.Balance > 0)
            .OrderBy(i => i.DueDate)
            .ToList();

        return new ClientStatementDto(
            client.Id, client.Name, client.Email, from, to, opening, lines, running, open,
            open.Where(i => i.DaysLate == 0).Sum(i => i.Balance),
            open.Where(i => i.DaysLate is > 0 and <= 30).Sum(i => i.Balance),
            open.Where(i => i.DaysLate is > 30 and <= 60).Sum(i => i.Balance),
            open.Where(i => i.DaysLate > 60).Sum(i => i.Balance));
    }

    /// <summary>The statement on paper, with the company's own header, colour and logo.</summary>
    public static async Task<byte[]> RenderAsync(VextaDbContext db, Guid tenantId, ClientStatementDto statement, CancellationToken ct)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        var settings = await db.BillingSettings.AsNoTracking().FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);
        var location = await db.CompanyLocations.AsNoTracking()
            .OrderByDescending(l => l.IsPrimary).ThenBy(l => l.CreatedAt)
            .FirstOrDefaultAsync(ct);
        var logo = await db.TenantLogos.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.TenantId == tenantId)
            .Select(l => l.Content)
            .FirstOrDefaultAsync(ct);
        var address = await db.Addresses.AsNoTracking()
            .Where(a => a.ClientId == statement.ClientId)
            .OrderByDescending(a => a.IsPrimary)
            .FirstOrDefaultAsync(ct);

        var document = new StatementDocument(
            statement,
            tenant?.Name ?? "",
            InvoicePdfService.CompanyLines(location, tenant, settings),
            logo,
            tenant?.BrandColor,
            InvoicePdfService.AddressLines(address),
            settings?.Currency ?? "CAD");
        return document.GeneratePdf();
    }

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}

/// <summary>The paper statement: the same header as the invoices, then the movements and what is open.</summary>
public class StatementDocument(
    ClientStatementDto statement,
    string companyName,
    IReadOnlyList<string> companyLines,
    byte[]? logo,
    string? brandColor,
    IReadOnlyList<string> clientAddress,
    string currency) : IDocument
{
    private readonly string Blue = Normalize(brandColor) ?? "#0982CE";
    private const string Grey = "#757575";
    private const string HairLine = "#E0E0E0";
    private static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("fr-CA");

    private static string? Normalize(string? hex)
    {
        if (string.IsNullOrWhiteSpace(hex)) return null;
        var value = hex.Trim();
        return value.Length == 7 && value[0] == '#' && value[1..].All(Uri.IsHexDigit) ? value.ToUpperInvariant() : null;
    }

    public DocumentMetadata GetMetadata() => new() { Title = $"État de compte — {statement.ClientName}", Author = companyName };

    public void Compose(IDocumentContainer container) => container.Page(page =>
    {
        page.Size(PageSizes.Letter);
        page.Margin(40);
        page.PageColor(Colors.White);
        page.DefaultTextStyle(text => text.FontFamily("Montserrat").FontSize(9).LineHeight(1.25f));
        page.Header().Element(Header);
        page.Content().PaddingTop(12).Element(Body);
        page.Footer().AlignCenter().Text(text =>
        {
            text.DefaultTextStyle(style => style.FontSize(7).FontColor("#9E9E9E"));
            text.Span("Page ");
            text.CurrentPageNumber();
            text.Span(" de ");
            text.TotalPages();
        });
    });

    private void Header(IContainer container) => container.Column(column =>
    {
        column.Item().Row(row =>
        {
            if (logo is { Length: > 0 })
            {
                row.ConstantItem(72).Height(72).AlignLeft().AlignMiddle().Image(logo).FitArea();
                row.ConstantItem(18);
            }
            row.RelativeItem().AlignMiddle().Column(info =>
            {
                info.Item().Text(companyName).Bold();
                foreach (var line in companyLines) info.Item().Text(line);
            });
            row.ConstantItem(200).Column(right =>
            {
                right.Item().AlignRight().Text("ÉTAT DE COMPTE").FontSize(16).Bold().FontColor(Blue);
                right.Item().AlignRight().Text($"Du {statement.From:yyyy-MM-dd} au {statement.To:yyyy-MM-dd}");
            });
        });
        column.Item().PaddingTop(10).LineHorizontal(1).LineColor(Blue);
    });

    private void Body(IContainer container) => container.Column(column =>
    {
        column.Item().Row(row =>
        {
            row.RelativeItem().Column(client =>
            {
                client.Item().Text("Client:").Bold().FontColor(Blue);
                client.Item().Text(statement.ClientName);
                foreach (var line in clientAddress) client.Item().Text(line);
                if (statement.ClientEmail is { Length: > 0 } email) client.Item().Text(email);
            });
            row.ConstantItem(200).Column(balance =>
            {
                balance.Item().AlignRight().Text("Solde à payer").FontColor(Grey);
                balance.Item().AlignRight().Text(Money(statement.ClosingBalance)).FontSize(16).Bold().FontColor(Blue);
            });
        });

        column.Item().PaddingTop(16).Text("Mouvements de la période").Bold().FontColor(Blue);
        column.Item().PaddingTop(6).Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                c.ConstantColumn(62);
                c.RelativeColumn();
                c.ConstantColumn(72);
                c.ConstantColumn(72);
                c.ConstantColumn(78);
            });
            table.Header(h =>
            {
                h.Cell().Element(Head).Text("Date");
                h.Cell().Element(Head).Text("Description");
                h.Cell().Element(Head).AlignRight().Text("Débit");
                h.Cell().Element(Head).AlignRight().Text("Crédit");
                h.Cell().Element(Head).AlignRight().Text("Solde");
            });
            table.Cell().Element(Cell).Text($"{statement.From:yyyy-MM-dd}");
            table.Cell().Element(Cell).Text("Solde reporté").Italic();
            table.Cell().Element(Cell).Text("");
            table.Cell().Element(Cell).Text("");
            table.Cell().Element(Cell).AlignRight().Text(Money(statement.OpeningBalance));
            foreach (var line in statement.Lines)
            {
                table.Cell().Element(Cell).Text($"{line.Date:yyyy-MM-dd}");
                table.Cell().Element(Cell).Text(line.Description);
                table.Cell().Element(Cell).AlignRight().Text(line.Debit == 0 ? "" : Money(line.Debit));
                table.Cell().Element(Cell).AlignRight().Text(line.Credit == 0 ? "" : Money(line.Credit));
                table.Cell().Element(Cell).AlignRight().Text(Money(line.Balance));
            }
        });

        column.Item().PaddingTop(16).Text("Factures à payer").Bold().FontColor(Blue);
        if (statement.OpenInvoices.Count == 0)
        {
            column.Item().PaddingTop(6).Text("Aucune facture à payer.").FontColor(Grey);
        }
        else
        {
            column.Item().PaddingTop(6).Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn();
                    c.ConstantColumn(70);
                    c.ConstantColumn(70);
                    c.ConstantColumn(60);
                    c.ConstantColumn(80);
                });
                table.Header(h =>
                {
                    h.Cell().Element(Head).Text("Facture");
                    h.Cell().Element(Head).Text("Date");
                    h.Cell().Element(Head).Text("Échéance");
                    h.Cell().Element(Head).AlignRight().Text("Retard");
                    h.Cell().Element(Head).AlignRight().Text("Solde");
                });
                foreach (var invoice in statement.OpenInvoices)
                {
                    table.Cell().Element(Cell).Text(invoice.Number);
                    table.Cell().Element(Cell).Text($"{invoice.IssueDate:yyyy-MM-dd}");
                    table.Cell().Element(Cell).Text($"{invoice.DueDate:yyyy-MM-dd}");
                    table.Cell().Element(Cell).AlignRight().Text(invoice.DaysLate == 0 ? "—" : $"{invoice.DaysLate} j");
                    table.Cell().Element(Cell).AlignRight().Text(Money(invoice.Balance));
                }
            });

            column.Item().PaddingTop(10).Row(row =>
            {
                foreach (var (label, amount) in new[]
                {
                    ("Courant", statement.Current), ("1 à 30 jours", statement.Late1To30),
                    ("31 à 60 jours", statement.Late31To60), ("Plus de 60 jours", statement.LateOver60)
                })
                {
                    row.RelativeItem().Border(0.5f).BorderColor(HairLine).Padding(6).Column(cell =>
                    {
                        cell.Item().Text(label).FontSize(8).FontColor(Grey);
                        cell.Item().Text(Money(amount)).Bold();
                    });
                }
            });
        }
    });

    private IContainer Head(IContainer cell) => cell.Background(Blue).PaddingVertical(5).PaddingHorizontal(4)
        .DefaultTextStyle(text => text.Bold().FontColor(Colors.White));

    private static IContainer Cell(IContainer cell) => cell.BorderBottom(0.5f).BorderColor(HairLine).PaddingVertical(4).PaddingHorizontal(4);

    private string Money(decimal amount)
    {
        var formatted = amount.ToString("N2", Culture).Replace(' ', ' ').Replace(' ', ' ');
        return currency.Equals("CAD", StringComparison.OrdinalIgnoreCase) ? $"{formatted} $" : $"{formatted} {currency.ToUpperInvariant()}";
    }
}

/// <summary>A client's statement: read it, print it, send it.</summary>
[ApiController]
[Route("api/clients/{clientId:guid}/etat-de-compte")]
[StaffOnly]
[Authorize(Roles = Roles.Managers)]
[RequireActiveSubscription]
public class ClientStatementController(
    VextaDbContext db, ICurrentUserService currentUser, IMailgunService mailgun) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ClientStatementDto>> Get(Guid clientId, [FromQuery] DateOnly? du, [FromQuery] DateOnly? au, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        var (from, to) = ClientStatements.Period(du, au);
        var statement = await ClientStatements.BuildAsync(db, tenantId, clientId, from, to, ct);
        return statement is null ? NotFound() : Ok(statement);
    }

    [HttpGet("pdf")]
    public async Task<IActionResult> Pdf(Guid clientId, [FromQuery] DateOnly? du, [FromQuery] DateOnly? au, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        var (from, to) = ClientStatements.Period(du, au);
        var statement = await ClientStatements.BuildAsync(db, tenantId, clientId, from, to, ct);
        if (statement is null) return NotFound();
        var bytes = await ClientStatements.RenderAsync(db, tenantId, statement, ct);
        return File(bytes, "application/pdf", $"Etat-de-compte-{FileSafe(statement.ClientName)}-{to:yyyy-MM-dd}.pdf");
    }

    /// <summary>Sends the statement as a PDF, to the client's courriel unless another is given.</summary>
    [HttpPost("envoyer")]
    public async Task<IActionResult> Send(Guid clientId, SendStatementBody request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        var (from, to) = ClientStatements.Period(request.From, request.To);
        var statement = await ClientStatements.BuildAsync(db, tenantId, clientId, from, to, ct);
        if (statement is null) return NotFound();

        var email = (string.IsNullOrWhiteSpace(request.Email) ? statement.ClientEmail : request.Email)?.Trim();
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@') || email.Length > 320)
            return BadRequest(new { message = "Ce client n'a pas de courriel valide. Entrez une adresse." });

        var company = await db.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.Id == tenantId).Select(t => t.Name).FirstOrDefaultAsync(ct) ?? "";
        var subject = string.IsNullOrWhiteSpace(request.Subject)
            ? $"État de compte — {company}"
            : request.Subject.Trim();
        if (subject.Length > 200) return BadRequest(new { message = "Le sujet est trop long." });
        var body = string.IsNullOrWhiteSpace(request.Body)
            ? $"Bonjour,\n\nVous trouverez ci-joint votre état de compte du {from:yyyy-MM-dd} au {to:yyyy-MM-dd}. "
              + $"Le solde à payer est de {statement.ClosingBalance.ToString("N2", CultureInfo.GetCultureInfo("fr-CA"))} $.\n\nMerci,\n{company}"
            : request.Body.Trim();
        if (body.Length > 10_000) return BadRequest(new { message = "Le message est trop long." });

        var pdf = await ClientStatements.RenderAsync(db, tenantId, statement, ct);
        try
        {
            await mailgun.SendWithAttachmentsAsync(
                email, statement.ClientName, subject, EmailText.ToHtml(body), [],
                [new EmailAttachment($"Etat-de-compte-{to:yyyy-MM-dd}.pdf", "application/pdf", pdf)],
                ct, company);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }

        SendHistory.Add(db, tenantId, "etat-de-compte", clientId, "Envoi", email, subject, null,
            currentUser.UserId, await SendHistory.NameOfAsync(db, currentUser.UserId, ct));
        await db.SaveChangesAsync(ct);
        return Ok(new { to = email });
    }

    private static string FileSafe(string name) =>
        new string(name.Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray()).Trim('-');
}

public record SendStatementBody(DateOnly? From, DateOnly? To, string? Email, string? Subject, string? Body);
