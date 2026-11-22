using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Team;

/// <summary>
/// The tenant's own staff list. Reserved to the owner and to a super admin who has entered the
/// tenant: an employee must not be able to hand themselves an account.
/// </summary>
[ApiController]
[Route("api/employees")]
[StaffOnly]
[Authorize(Roles = $"{nameof(UserRole.TenantAdmin)},{nameof(UserRole.SuperAdmin)}")]
[RequireActiveSubscription]
public class EmployeesController(
    VextaDbContext db,
    IEmployeeAccessService access,
    UserManager<ApplicationUser> userManager,
    ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<TeamListDto>> List(CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();

        var employees = await db.Employees.AsNoTracking()
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName)
            .ToListAsync(ct);

        // One query for every employee that has an account, rather than one per row.
        var withPassword = await PasswordHoldersAsync(employees, ct);
        var owners = await OwnersAsync(employees, ct);

        var now = DateTimeOffset.UtcNow;
        var dtos = employees.Select(e => ToDto(e, withPassword, owners, now)).ToList();

        return Ok(new TeamListDto(dtos, ToDto(await access.GetSeatUsageAsync(tenantId, ct))));
    }

    /// <summary>One employee's own page: the record, the state of their access, their teams.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<EmployeeDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var employee = await db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null) return NotFound();

        var teams = await db.Teams.AsNoTracking()
            .Where(t => t.Members.Any(m => m.Id == id) || t.LeadEmployeeId == id)
            .OrderBy(t => t.Name)
            .Select(t => new EmployeeTeamDto(t.Id, t.Name, t.LeadEmployeeId == id))
            .ToListAsync(ct);

        var dto = ToDto(
            employee,
            await PasswordHoldersAsync([employee], ct),
            await OwnersAsync([employee], ct),
            DateTimeOffset.UtcNow);

        return Ok(new EmployeeDetailDto(dto, teams));
    }

    [HttpPost]
    [RequireBusinessTenant]
    public async Task<ActionResult<EmployeeDto>> Create(SaveEmployeeRequest request, CancellationToken ct)
    {
        if (currentUser.TenantId is not { } tenantId) return Forbid();
        if (Validate(request) is { } error) return BadRequest(new { message = error });

        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Employees.AnyAsync(e => e.Email == email, ct))
        {
            return Conflict(new { message = "Un employé utilise déjà ce courriel." });
        }

        var employee = new Employee
        {
            TenantId = tenantId,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Email = email,
            JobTitle = Clean(request.JobTitle),
            Phone = Clean(request.Phone)
        };

        db.Employees.Add(employee);
        await db.SaveChangesAsync(ct);

        return Ok(ToDto(employee, EmptySet, EmptySet, DateTimeOffset.UtcNow));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<EmployeeDto>> Update(Guid id, SaveEmployeeRequest request, CancellationToken ct)
    {
        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null) return NotFound();
        if (Validate(request) is { } error) return BadRequest(new { message = error });

        var email = request.Email.Trim().ToLowerInvariant();
        if (email != employee.Email && await db.Employees.AnyAsync(e => e.Email == email && e.Id != id, ct))
        {
            return Conflict(new { message = "Un employé utilise déjà ce courriel." });
        }

        // The address is the sign-in name once access exists, so changing it here would silently
        // desynchronise the two. Refusing is clearer than changing a password-less account's login.
        if (email != employee.Email && employee.UserId is not null)
        {
            return BadRequest(new
            {
                message = "Retirez l'accès avant de changer le courriel : c'est aussi son identifiant de connexion."
            });
        }

        employee.FirstName = request.FirstName.Trim();
        employee.LastName = request.LastName.Trim();
        employee.Email = email;
        employee.JobTitle = Clean(request.JobTitle);
        employee.Phone = Clean(request.Phone);
        employee.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        var withPassword = await PasswordHoldersAsync([employee], ct);
        return Ok(ToDto(employee, withPassword, await OwnersAsync([employee], ct), DateTimeOffset.UtcNow));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null) return NotFound();

        if (await IsOwnerAsync(employee, ct))
        {
            return BadRequest(new
            {
                message = "Cette fiche est celle du propriétaire de l'entreprise et ne peut pas être supprimée."
            });
        }

        // Removing the record must also remove the way in, otherwise a deleted employee keeps
        // a working login that no page lists any more.
        await access.RevokeAsync(employee, ct);

        db.Employees.Remove(employee);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Ticking the access box. Creates the account and issues the first invitation.</summary>
    [HttpPost("{id:guid}/access")]
    [RequireBusinessTenant]
    public async Task<ActionResult<AccessGrantedDto>> GrantAccess(Guid id, CancellationToken ct)
    {
        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null) return NotFound();

        var (grant, error) = await access.GrantAsync(employee, ct);
        if (grant is null) return BadRequest(new { message = error });

        await db.SaveChangesAsync(ct);

        return Ok(new AccessGrantedDto(
            grant.InvitationUrl,
            grant.ExpiresAt,
            grant.EmailSent,
            ToDto(employee, EmptySet, await OwnersAsync([employee], ct), DateTimeOffset.UtcNow)));
    }

    /// <summary>Unticking the box. The employee stays on file; the seat comes back.</summary>
    [HttpDelete("{id:guid}/access")]
    public async Task<IActionResult> RevokeAccess(Guid id, CancellationToken ct)
    {
        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null) return NotFound();

        if (employee.UserId == currentUser.UserId)
        {
            return BadRequest(new { message = "Vous ne pouvez pas retirer votre propre accès." });
        }

        if (await IsOwnerAsync(employee, ct))
        {
            return BadRequest(new
            {
                message = "Le propriétaire de l'entreprise garde son accès : c'est le compte auquel l'espace appartient."
            });
        }

        await access.RevokeAsync(employee, ct);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/access/resend")]
    [RequireBusinessTenant]
    public async Task<ActionResult<AccessGrantedDto>> ResendInvitation(Guid id, CancellationToken ct)
    {
        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null) return NotFound();

        var (grant, error) = await access.ResendAsync(employee, ct);
        if (grant is null) return BadRequest(new { message = error });

        await db.SaveChangesAsync(ct);

        return Ok(new AccessGrantedDto(
            grant.InvitationUrl,
            grant.ExpiresAt,
            grant.EmailSent,
            ToDto(employee, EmptySet, await OwnersAsync([employee], ct), DateTimeOffset.UtcNow)));
    }

    /// <summary>A freshly granted or created employee cannot have a password yet.</summary>
    private static readonly HashSet<Guid> EmptySet = [];

    private async Task<HashSet<Guid>> PasswordHoldersAsync(IEnumerable<Employee> employees, CancellationToken ct)
    {
        var ids = employees.Where(e => e.UserId is not null).Select(e => e.UserId!.Value).ToList();
        if (ids.Count == 0) return new HashSet<Guid>();

        return await userManager.Users.IgnoreQueryFilters()
            .Where(u => ids.Contains(u.Id) && u.PasswordHash != null)
            .Select(u => u.Id)
            .ToHashSetAsync(ct);
    }

    /// <summary>
    /// Which of these employees are the owner of the company. Read from the account's role
    /// rather than from a flag on the employee: the owner is a property of the account that
    /// holds the space, and a second copy of that truth would be a second thing to keep right.
    /// </summary>
    private async Task<HashSet<Guid>> OwnersAsync(IEnumerable<Employee> employees, CancellationToken ct)
    {
        var ids = employees.Where(e => e.UserId is not null).Select(e => e.UserId!.Value).ToList();
        if (ids.Count == 0) return [];

        return await userManager.Users.IgnoreQueryFilters()
            .Where(u => ids.Contains(u.Id) && u.Role == UserRole.TenantAdmin)
            .Select(u => u.Id)
            .ToHashSetAsync(ct);
    }

    private async Task<bool> IsOwnerAsync(Employee employee, CancellationToken ct) =>
        employee.UserId is { } userId && (await OwnersAsync([employee], ct)).Contains(userId);

    private static EmployeeDto ToDto(Employee e, IReadOnlySet<Guid> withPassword, IReadOnlySet<Guid> owners, DateTimeOffset now)
    {
        var hasAccess = e.UserId is not null;
        var passwordSet = e.UserId is { } id && withPassword.Contains(id);
        var pending = hasAccess && !passwordSet;

        return new EmployeeDto(
            e.Id,
            e.FirstName,
            e.LastName,
            e.Email,
            e.JobTitle,
            e.Phone,
            hasAccess,
            pending,
            pending && e.InvitationExpiresAt <= now,
            e.InvitationSentAt,
            e.InvitationExpiresAt,
            e.UserId is { } ownerId && owners.Contains(ownerId),
            e.CreatedAt);
    }

    private static SeatUsageDto ToDto(SeatUsage s) =>
        new(s.Used, s.Limit, s.Remaining, s.HasRoom, s.LimitReason);

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? Validate(SaveEmployeeRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.FirstName)) return "Le prénom est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.LastName)) return "Le nom est obligatoire.";
        if (string.IsNullOrWhiteSpace(r.Email)) return "Le courriel est obligatoire.";
        if (r.FirstName.Trim().Length > 100 || r.LastName.Trim().Length > 100) return "100 caractères maximum.";
        if (r.Email.Trim().Length > 256) return "Le courriel est trop long.";
        if (!r.Email.Contains('@') || !r.Email.Contains('.')) return "Entrez un courriel valide.";
        if (r.JobTitle is { Length: > 100 }) return "Le titre ne peut pas dépasser 100 caractères.";
        if (r.Phone is { Length: > 40 }) return "Le téléphone ne peut pas dépasser 40 caractères.";
        return null;
    }
}
