using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Auth;
using Vexta.Api.Common;
using Vexta.Api.Data;
using Vexta.Api.Domain;
using Vexta.Api.Features.Auth;

namespace Vexta.Api.Features.Tenants;

[ApiController]
[Route("api/admin/tenants")]
[Authorize(Roles = Roles.Platform)]
public class TenantsController(
    VextaDbContext db,
    UserManager<ApplicationUser> userManager,
    ITokenService tokenService,
    ICurrentUserService currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<TenantDto>>> List(
        [FromQuery] PagingQuery query, [FromQuery] TenantKind? kind)
    {
        var tenants = db.Tenants.IgnoreQueryFilters().AsNoTracking();

        // The two kinds are listed separately: a company that pays and a person's free space
        // share a table and nothing else — status, plan and seats are meaningless for one of
        // them. Filtering here rather than splitting the page keeps each list paged on its own.
        if (kind is { } wanted)
        {
            tenants = tenants.Where(t => t.Kind == wanted);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            tenants = tenants.Where(t => t.Name.Contains(query.Search) || t.Slug.Contains(query.Search));
        }

        var totalCount = await tenants.CountAsync();

        var items = await tenants
            .OrderByDescending(t => t.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(t => new TenantDto(
                t.Id, t.Name, t.Slug, t.Kind.ToString(), t.SubscriptionStatus.ToString(), t.CurrentPeriodEnd, t.CreatedAt,
                // Counted exactly as the company's own Employés page counts it, and as
                // EmployeeAccessService.GetSeatUsageAsync decides whether a seat is free: by
                // membership, not by whose home space this is. Counting homes read 2 / 3 on this
                // screen while the company read 3 / 3 on its own, and the company was right —
                // someone who lives in their personal space still holds a seat here.
                db.TenantMemberships.Count(m => m.TenantId == t.Id && m.Role != UserRole.Client),
                db.Clients.IgnoreQueryFilters().Count(c => c.TenantId == t.Id),
                t.PlanId,
                t.Plan!.Name,
                t.PlanId == null ? 1 : t.Plan!.MaxUsers))
            .ToListAsync();

        return Ok(new PagedResult<TenantDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = totalCount });
    }

    [HttpPost]
    public async Task<ActionResult<TenantDto>> Create(CreateTenantRequest request)
    {
        var existing = await userManager.FindByEmailAsync(request.AdminEmail.Trim());
        if (existing is not null)
        {
            return Conflict(new { message = "Un compte existe déjà avec ce courriel." });
        }

        var slug = SlugFor(request.CompanyName);
        var suffix = 1;
        while (await db.Tenants.IgnoreQueryFilters().AnyAsync(t => t.Slug == slug))
        {
            slug = $"{SlugFor(request.CompanyName)}-{++suffix}";
        }

        var tenant = new Tenant
        {
            Name = request.CompanyName.Trim(),
            Slug = slug,
            SubscriptionStatus = TenantSubscriptionStatus.Active
        };
        db.Tenants.Add(tenant);

        var user = new ApplicationUser
        {
            UserName = request.AdminEmail.Trim(),
            Email = request.AdminEmail.Trim(),
            FirstName = request.AdminFirstName.Trim(),
            LastName = request.AdminLastName.Trim(),
            Role = UserRole.TenantAdmin,
            TenantId = tenant.Id
        };

        var createResult = await userManager.CreateAsync(user, request.AdminPassword);
        if (!createResult.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", createResult.Errors.Select(e => e.Description)) });
        }

        // The person running the company is a person who works there, and both of the places
        // that say so have to be written here.
        //
        // The membership is what the space switcher reads and what the seat count counts, so
        // without it this account owned a company it could not open and the Locataires page
        // reported 0 / 1 users for a tenant that plainly had one.
        db.TenantMemberships.Add(new TenantMembership
        {
            UserId = user.Id,
            TenantId = tenant.Id,
            Role = UserRole.TenantAdmin
        });

        // And the employee record, because Ressources humaines is where a company looks for the
        // people who work there. Created with the account already linked — the invitation flow
        // exists to hand out a password, and this one was just given one.
        db.Employees.Add(new Employee
        {
            TenantId = tenant.Id,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Email = user.Email!,
            JobTitle = "Responsable",
            Role = UserRole.TenantAdmin,
            UserId = user.Id
        });

        await db.SaveChangesAsync();

        return Ok(new TenantDto(tenant.Id, tenant.Name, tenant.Slug, tenant.Kind.ToString(), tenant.SubscriptionStatus.ToString(), null, tenant.CreatedAt, 1, 0, null, null, 1));
    }

    /// <summary>
    /// Removes a space and everything in it.
    ///
    /// Done by hand rather than left to the database. Only eight tables carry a foreign key back
    /// to Tenants; the rest — projects, invoices, products, the whole of Ressources humaines —
    /// hold a bare TenantId with no constraint behind it, so deleting the tenant row alone would
    /// leave every one of those rows in place, invisible to the filters and attached to a
    /// company that no longer exists.
    ///
    /// The order is the one the remaining constraints impose: expenses before the expense types
    /// they name, a product's parent link cleared before the products themselves. One
    /// transaction, so a tenant is either gone or untouched.
    ///
    /// Stripe is not told. A subscription keeps billing until it is cancelled there, which is
    /// deliberate: this endpoint must never be able to end someone's billing by accident.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (tenant is null) return NotFound(new { message = "Ce locataire n'existe plus." });

        // Through the execution strategy, not a bare BeginTransaction. The Npgsql provider is
        // configured to retry on a transient failure, and a retrying strategy refuses to take
        // part in a transaction it did not open — it has no way to replay work that has already
        // been committed halfway. Everything below therefore runs inside one retriable unit.
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(ct);

            async Task Wipe<T>(IQueryable<T> rows) where T : class =>
                await rows.IgnoreQueryFilters().ExecuteDeleteAsync(ct);

            await Wipe(db.ProjectExpensePhotos.Where(x => x.TenantId == id));
            await Wipe(db.ProjectMaterials.Where(x => x.TenantId == id));
            await Wipe(db.TimesheetEntries.Where(x => x.TenantId == id));
            await Wipe(db.ProjectDocuments.Where(x => x.TenantId == id));
            await Wipe(db.ProjectNotes.Where(x => x.TenantId == id));
            // Before Teams, which a task may point at, and before Employees, whose join
            // rows go with the task.
            await Wipe(db.ProjectTasks.Where(x => x.TenantId == id));
            await Wipe(db.ProjectExpenses.Where(x => x.TenantId == id));
            await Wipe(db.ExpenseTypes.Where(x => x.TenantId == id));

            // Invoice lines go with their invoice, which does cascade.
            // Before the invoices they hang off, and before the clients they belong to. Both
            // would cascade from the database, but this sweep is explicit about everything so
            // that reading it tells you what a deleted tenant takes with it.
            // Refunds before the payments they point at, which they do not cascade from.
            await Wipe(db.InvoiceRefunds.Where(x => x.TenantId == id));
            await Wipe(db.InvoiceCredits.Where(x => x.TenantId == id));
            await Wipe(db.InvoicePayments.Where(x => x.TenantId == id));
            await Wipe(db.ClientAccountEntries.Where(x => x.TenantId == id));
            await Wipe(db.Invoices.Where(x => x.TenantId == id));
            await Wipe(db.Projects.Where(x => x.TenantId == id));

            await Wipe(db.ProductImages.Where(x => x.TenantId == id));
            await Wipe(db.ProductPriceEntries.Where(x => x.TenantId == id));
            await Wipe(db.ProductStockEntries.Where(x => x.TenantId == id));
            // A product can name another as its parent, and that link refuses the delete rather
            // than following it, so it is cut first.
            await db.Products.IgnoreQueryFilters()
                .Where(x => x.TenantId == id && x.ParentProductId != null)
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.ParentProductId, (Guid?)null), ct);
            await Wipe(db.Products.Where(x => x.TenantId == id));
            await Wipe(db.ProductSubCategories.Where(x => x.TenantId == id));
            await Wipe(db.ProductCategories.Where(x => x.TenantId == id));

            // A submission points at the client it created, and an answer at its question, so
            // the four tables come down innermost first.
            // Before the media assets they point at, which cascade with the tenant.
            await Wipe(db.ReceiptScans.Where(x => x.TenantId == id));

            await Wipe(db.FormAnswers.Where(x => x.TenantId == id));
            await Wipe(db.FormSubmissions.Where(x => x.TenantId == id));
            await Wipe(db.FormActions.Where(x => x.TenantId == id));
            await Wipe(db.FormFields.Where(x => x.TenantId == id));
            await Wipe(db.FormTemplates.Where(x => x.TenantId == id));

            await Wipe(db.ClientContacts.Where(x => x.TenantId == id));
            // Before the addresses some of them point at, and before the types they name.
            await Wipe(db.ClientAssets.Where(x => x.TenantId == id));
            await Wipe(db.ClientAssetTypes.Where(x => x.TenantId == id));
            await Wipe(db.Addresses.Where(x => x.TenantId == id));
            await Wipe(db.HrDocuments.Where(x => x.TenantId == id));
            // Before the postings they answered. A candidate carries a name, a telephone number
            // and a link to a CV, and nothing in the model takes them with the tenant — so a
            // company deleted on request was leaving its applicants' details behind, invisible
            // to every filter but still in the database.
            await Wipe(db.Candidates.Where(x => x.TenantId == id));
            await Wipe(db.JobPostings.Where(x => x.TenantId == id));
            await Wipe(db.CompanyLocations.Where(x => x.TenantId == id));
            await Wipe(db.Teams.Where(x => x.TenantId == id));
            await Wipe(db.PricePolicies.Where(x => x.TenantId == id));

            // The last of them cascade from the tenant row itself: users, memberships, employees,
            // clients, billing settings, media, public pages and the logo.
            await Wipe(db.Tenants.Where(t => t.Id == id));

            await transaction.CommitAsync(ct);
        });

        return NoContent();
    }

    [HttpPatch("{id:guid}/subscription-status")]
    public async Task<IActionResult> UpdateSubscriptionStatus(Guid id, UpdateTenantSubscriptionRequest request)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id);
        if (tenant is null) return NotFound();

        tenant.SubscriptionStatus = request.Status;
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Assigns the plan a hand-created tenant never got. Without this the space stays capped at
    /// one seat forever, because the seat limit is the plan's and there is no plan.
    /// </summary>
    [HttpPatch("{id:guid}/plan")]
    public async Task<IActionResult> UpdatePlan(Guid id, UpdateTenantPlanRequest request, CancellationToken ct)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (tenant is null) return NotFound();

        if (request.PlanId is { } planId)
        {
            if (!await db.Plans.AnyAsync(p => p.Id == planId, ct))
            {
                return BadRequest(new { message = "Ce forfait n'existe pas." });
            }

            // Nothing here touches Stripe: the subscription, if any, keeps charging what it
            // charges. This sets what the space is allowed to do, not what it pays.
            tenant.PlanId = planId;
        }
        else
        {
            tenant.PlanId = null;
        }

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/impersonate")]
    public async Task<ActionResult<AuthResponse>> Impersonate(Guid id)
    {
        var tenant = await db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == id);
        if (tenant is null) return NotFound();

        var superAdmin = await CurrentSuperAdminAsync();
        if (superAdmin is null) return Unauthorized();

        var token = tokenService.CreateAccessToken(superAdmin, impersonatedTenantId: tenant.Id);
        return Ok(new AuthResponse(token, UserDto.ForImpersonation(superAdmin, tenant)));
    }

    [HttpPost("exit-impersonation")]
    public async Task<ActionResult<AuthResponse>> ExitImpersonation()
    {
        var superAdmin = await CurrentSuperAdminAsync();
        if (superAdmin is null) return Unauthorized();

        var token = tokenService.CreateAccessToken(superAdmin);
        return Ok(new AuthResponse(token, UserDto.ForUser(superAdmin)));
    }

    private async Task<ApplicationUser?> CurrentSuperAdminAsync()
    {
        if (currentUser.UserId is not { } userId) return null;
        return await userManager.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId);
    }

    private static string SlugFor(string name)
    {
        var lowered = name.Trim().ToLowerInvariant();
        var cleaned = System.Text.RegularExpressions.Regex.Replace(lowered, "[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(cleaned) ? Guid.NewGuid().ToString("N")[..8] : cleaned;
    }
}
