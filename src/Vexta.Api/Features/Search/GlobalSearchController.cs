using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;

namespace Vexta.Api.Features.Search;

/// <summary>One thing found: what it is, how it reads, and where it opens.</summary>
public record SearchHitDto(string Type, Guid Id, string Title, string? Subtitle, string Href);

/// <summary>
/// The search in the top bar: one query across the company's clients, projects, quotes,
/// invoices, products, equipment, suppliers and employees. The query filters keep it to the
/// company's own data; a few hits per kind, because it is a way to jump, not a report.
/// </summary>
[ApiController]
[Route("api/recherche")]
[Authorize(Roles = Roles.Staff)]
[StaffOnly]
public class GlobalSearchController(VextaDbContext db) : ControllerBase
{
    private const int PerKind = 5;

    [HttpGet]
    public async Task<ActionResult<List<SearchHitDto>>> Search([FromQuery] string? q, CancellationToken ct)
    {
        var text = q?.Trim() ?? "";
        if (text.Length < 2) return Ok(new List<SearchHitDto>());
        if (text.Length > 100) text = text[..100];

        var pattern = $"%{text.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_")}%";
        var digits = new string(text.Where(char.IsDigit).ToArray());
        int? number = digits.Length is > 0 and < 9 && int.TryParse(digits, out var n) ? n : null;

        var hits = new List<SearchHitDto>();

        hits.AddRange((await db.Clients.AsNoTracking()
            .Where(c => EF.Functions.ILike(c.Name, pattern)
                || (c.CompanyName != null && EF.Functions.ILike(c.CompanyName, pattern))
                || (c.Email != null && EF.Functions.ILike(c.Email, pattern))
                || (c.Phone != null && EF.Functions.ILike(c.Phone, pattern))
                || (number != null && c.Number == number))
            .OrderByDescending(c => c.Number).Take(PerKind)
            .Select(c => new { c.Id, c.Number, c.Name, c.Email })
            .ToListAsync(ct))
            .Select(c => new SearchHitDto("client", c.Id, c.Name, $"C-{c.Number:0000}{(c.Email is null ? "" : " · " + c.Email)}", $"/clients/{c.Id}")));

        hits.AddRange((await db.Projects.AsNoTracking()
            .Where(p => EF.Functions.ILike(p.Client!.Name, pattern)
                || (p.Description != null && EF.Functions.ILike(p.Description, pattern))
                || (p.PoNumber != null && EF.Functions.ILike(p.PoNumber, pattern))
                || (number != null && p.Number == number))
            .OrderByDescending(p => p.Number).Take(PerKind)
            .Select(p => new { p.Id, p.Number, Client = p.Client!.Name, p.Description })
            .ToListAsync(ct))
            .Select(p => new SearchHitDto("projet", p.Id, $"P-{p.Number:0000} · {p.Client}", p.Description, $"/projets/{p.Id}")));

        hits.AddRange((await db.Quotes.AsNoTracking()
            .Where(x => EF.Functions.ILike(x.Client!.Name, pattern)
                || (x.Description != null && EF.Functions.ILike(x.Description, pattern))
                || (number != null && x.Number == number))
            .OrderByDescending(x => x.Number).Take(PerKind)
            .Select(x => new { x.Id, x.Number, Client = x.Client!.Name, x.Description })
            .ToListAsync(ct))
            .Select(x => new SearchHitDto("soumission", x.Id, $"S-{x.Number:0000} · {x.Client}", x.Description, $"/soumissions/{x.Id}")));

        hits.AddRange((await db.Invoices.AsNoTracking()
            .Where(i => EF.Functions.ILike(i.Number, pattern) || EF.Functions.ILike(i.Client!.Name, pattern))
            .OrderByDescending(i => i.IssueDate).Take(PerKind)
            .Select(i => new { i.Id, i.Number, Client = i.Client!.Name, i.Status })
            .ToListAsync(ct))
            .Select(i => new SearchHitDto("facture", i.Id, $"{i.Number} · {i.Client}", null, $"/factures/{i.Id}")));

        hits.AddRange((await db.Products.AsNoTracking()
            .Where(p => EF.Functions.ILike(p.Title, pattern)
                || (p.Code != null && EF.Functions.ILike(p.Code, pattern))
                || (number != null && p.Number == number))
            .OrderBy(p => p.Title).Take(PerKind)
            .Select(p => new { p.Id, p.Number, p.Title, p.Code })
            .ToListAsync(ct))
            .Select(p => new SearchHitDto("produit", p.Id, p.Title, $"A-{p.Number:0000}{(p.Code is null ? "" : " · " + p.Code)}", $"/inventaire/produits/{p.Id}")));

        hits.AddRange((await db.Equipment.AsNoTracking()
            .Where(e => EF.Functions.ILike(e.Name, pattern)
                || (e.SerialNumber != null && EF.Functions.ILike(e.SerialNumber, pattern))
                || (number != null && e.Number == number))
            .OrderBy(e => e.Name).Take(PerKind)
            .Select(e => new { e.Id, e.Number, e.Name })
            .ToListAsync(ct))
            .Select(e => new SearchHitDto("equipement", e.Id, e.Name, $"EQ-{e.Number:0000}", $"/equipements?id={e.Id}")));

        hits.AddRange((await db.Suppliers.AsNoTracking()
            .Where(s => EF.Functions.ILike(s.Name, pattern)
                || (s.ContactName != null && EF.Functions.ILike(s.ContactName, pattern))
                || (s.Email != null && EF.Functions.ILike(s.Email, pattern)))
            .OrderBy(s => s.Name).Take(PerKind)
            .Select(s => new { s.Id, s.Name, s.ContactName })
            .ToListAsync(ct))
            .Select(s => new SearchHitDto("fournisseur", s.Id, s.Name, s.ContactName, $"/approvisionnement/fournisseurs/{s.Id}")));

        hits.AddRange((await db.Employees.AsNoTracking()
            .Where(e => EF.Functions.ILike(e.FirstName + " " + e.LastName, pattern)
                || EF.Functions.ILike(e.Email, pattern))
            .OrderBy(e => e.LastName).Take(PerKind)
            .Select(e => new { e.Id, e.FirstName, e.LastName, e.JobTitle })
            .ToListAsync(ct))
            .Select(e => new SearchHitDto("employe", e.Id, $"{e.FirstName} {e.LastName}".Trim(), e.JobTitle, $"/ressources-humaines/employes/{e.Id}")));

        return Ok(hits);
    }
}
