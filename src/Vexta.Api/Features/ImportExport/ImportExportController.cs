using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.ImportExport;

public record ImportResultDto(
    int Created,
    int Updated,
    int Skipped,
    IReadOnlyList<string> Problems,
    string Message);

/// <summary>
/// Three buttons on four screens: download the template, download what is there, put a file back.
/// </summary>
[ApiController]
[Route("api/import-export")]
public class ImportExportController(
    VextaDbContext db,
    ICurrentUserService currentUser,
    IWorkbookService workbooks,
    ILogger<ImportExportController> logger) : ControllerBase
{
    private const string ContentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /// <summary>
    /// A workbook bigger than this is not a list of clients, it is a mistake. Read into memory
    /// whole, so the ceiling is what keeps one upload from taking the server down with it.
    /// </summary>
    private const long MaxBytes = 10 * 1024 * 1024;

    private static readonly IEntityWorkbook[] Workbooks =
    [
        new ClientWorkbook(),
        new EmployeeWorkbook(),
        new SupplierWorkbook(),
        new ProductWorkbook(),
    ];

    [HttpGet("{entity}/modele")]
    [Authorize(Roles = Roles.Managers)]
    public IActionResult Template(string entity)
    {
        if (Resolve(entity) is not { } workbook) return NotFound();
        if (Refuse(workbook) is { } refusal) return refusal;

        return File(workbooks.Write(workbook.Template()), ContentType, $"modele-{workbook.FileName}.xlsx");
    }

    [HttpGet("{entity}/export")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Export(string entity, CancellationToken ct)
    {
        if (Resolve(entity) is not { } workbook) return NotFound();
        if (Refuse(workbook) is { } refusal) return refusal;
        if (currentUser.TenantId is not { } tenantId) return NotFound();

        var sheets = await workbook.ExportAsync(db, tenantId, ct);
        var name = $"{workbook.FileName}-{BusinessDay.Today:yyyy-MM-dd}.xlsx";

        return File(workbooks.Write(sheets), ContentType, name);
    }

    [HttpPost("{entity}/import")]
    [Authorize(Roles = Roles.Managers)]
    [RequestSizeLimit(MaxBytes)]
    public async Task<ActionResult<ImportResultDto>> Import(string entity, IFormFile? fichier, CancellationToken ct)
    {
        if (Resolve(entity) is not { } workbook) return NotFound();
        if (Refuse(workbook) is { } refusal) return refusal;
        if (currentUser.TenantId is not { } tenantId) return NotFound();

        if (fichier is null || fichier.Length == 0)
        {
            return BadRequest(new { message = "Aucun fichier reçu." });
        }

        if (fichier.Length > MaxBytes)
        {
            return BadRequest(new { message = "Ce fichier est trop lourd. La limite est de 10 Mo." });
        }

        if (!fichier.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new
            {
                message = "Seuls les fichiers .xlsx sont lus. Enregistrez votre feuille au format Excel (.xlsx) et réessayez."
            });
        }

        IReadOnlyDictionary<string, IReadOnlyList<WorkbookRow>> sheets;
        try
        {
            using var stream = fichier.OpenReadStream();
            using var memory = new MemoryStream();
            await stream.CopyToAsync(memory, ct);
            memory.Position = 0;
            sheets = workbooks.Read(memory);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Classeur illisible lors de l'importation de {Entity}.", entity);
            return BadRequest(new
            {
                message = "Ce fichier n'a pas pu être ouvert. Vérifiez que c'est bien un classeur Excel (.xlsx) non protégé."
            });
        }

        if (sheets.Count == 0)
        {
            return BadRequest(new { message = "Ce classeur ne contient aucune feuille avec des données." });
        }

        try
        {
            var report = await workbook.ImportAsync(db, tenantId, sheets, ct);

            var message = report switch
            {
                { Created: 0, Updated: 0 } => "Rien n'a été importé.",
                { Updated: 0 } => $"{report.Created} ligne(s) créée(s).",
                { Created: 0 } => $"{report.Updated} ligne(s) mise(s) à jour.",
                _ => $"{report.Created} ligne(s) créée(s), {report.Updated} mise(s) à jour.",
            };

            if (report.Skipped > 0)
            {
                message += $" {report.Skipped} ignorée(s).";
            }

            // Capped: a file where every row is wrong would otherwise answer with a thousand
            // sentences nobody is going to read.
            var problems = report.Problems.Take(50).ToList();
            if (report.Problems.Count > problems.Count)
            {
                problems.Add($"… et {report.Problems.Count - problems.Count} autre(s) problème(s).");
            }

            return Ok(new ImportResultDto(report.Created, report.Updated, report.Skipped, problems, message));
        }
        catch (Exception ex)
        {
            // Nothing is saved on the way through: each workbook writes once at the end, so a
            // failure here leaves the company's data exactly as it was.
            // The entity types are named on purpose. "L'importation a échoué" in a log is a
            // sentence nobody can act on; "Address, Added" is a line that points at the row.
            var entries = ex is Microsoft.EntityFrameworkCore.DbUpdateException { Entries.Count: > 0 } update
                ? string.Join(", ", update.Entries.Select(e => $"{e.Entity.GetType().Name}/{e.State}"))
                : "—";

            logger.LogError(ex, "Importation de {Entity} impossible. Entités en cause : {Entries}", entity, entries);
            return BadRequest(new
            {
                message = "L'importation a échoué et rien n'a été enregistré. Vérifiez les colonnes du fichier."
            });
        }
    }

    private static IEntityWorkbook? Resolve(string entity) =>
        Workbooks.FirstOrDefault(w => w.Slug.Equals(entity, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// The employee file is the owner's, like every other screen that shows it. A chargé de
    /// projet importing clients is ordinary; one exporting the payroll's contact list is not.
    /// </summary>
    private ObjectResult? Refuse(IEntityWorkbook workbook)
    {
        if (workbook is not EmployeeWorkbook) return null;
        if (currentUser.Role is UserRole.TenantAdmin or UserRole.SuperAdmin) return null;

        return StatusCode(403, new
        {
            message = "Seul un administrateur de l'entreprise peut importer ou exporter les employés."
        });
    }
}
