using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Common;
using Vexta.Api.Domain;

namespace Vexta.Api.Data;

// Takes IHttpContextAccessor (a singleton) rather than the scoped ICurrentUserService,
// because this DbContext is pooled: EF Core's pool validates constructor dependencies
// against the root provider, which rejects scoped services.
public class VextaDbContext(DbContextOptions<VextaDbContext> options, IHttpContextAccessor httpContextAccessor)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options)
{
    private Guid? CurrentTenantId =>
        Guid.TryParse(httpContextAccessor.HttpContext?.User.FindFirst(VextaClaimTypes.TenantId)?.Value, out var id)
            ? id
            : null;

    /// <summary>
    /// Set only for someone signed in as a client of this tenant, and then it narrows what they
    /// can read to their own record. Null for everyone who works there, which is why every
    /// filter below reads "no client scope, or this client" — staff are unaffected.
    ///
    /// It belongs in the query filter rather than in each controller for the same reason the
    /// tenant does: one endpoint that forgets it is a customer reading another customer's
    /// invoices, and there is no version of that which is acceptable.
    /// </summary>
    private Guid? CurrentClientId =>
        Guid.TryParse(httpContextAccessor.HttpContext?.User.FindFirst(VextaClaimTypes.ClientId)?.Value, out var id)
            ? id
            : null;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Client> Clients => Set<Client>();
    public DbSet<Address> Addresses => Set<Address>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();
    public DbSet<PlatformSetting> PlatformSettings => Set<PlatformSetting>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<Module> Modules => Set<Module>();
    public DbSet<BrandingAsset> BrandingAssets => Set<BrandingAsset>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<ClientContact> ClientContacts => Set<ClientContact>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<CompanyLocation> CompanyLocations => Set<CompanyLocation>();
    public DbSet<HrDocument> HrDocuments => Set<HrDocument>();
    public DbSet<TenantLogo> TenantLogos => Set<TenantLogo>();
    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();
    public DbSet<BillingSettings> BillingSettings => Set<BillingSettings>();
    public DbSet<ProjectExpense> ProjectExpenses => Set<ProjectExpense>();
    public DbSet<ProjectMaterial> ProjectMaterials => Set<ProjectMaterial>();
    public DbSet<TimesheetEntry> TimesheetEntries => Set<TimesheetEntry>();
    public DbSet<ProjectDocument> ProjectDocuments => Set<ProjectDocument>();
    public DbSet<ProjectNote> ProjectNotes => Set<ProjectNote>();
    public DbSet<ExpenseType> ExpenseTypes => Set<ExpenseType>();
    public DbSet<ProjectExpensePhoto> ProjectExpensePhotos => Set<ProjectExpensePhoto>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<ProductSubCategory> ProductSubCategories => Set<ProductSubCategory>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<ProductPriceEntry> ProductPriceEntries => Set<ProductPriceEntry>();
    public DbSet<ProductStockEntry> ProductStockEntries => Set<ProductStockEntry>();
    public DbSet<PricePolicy> PricePolicies => Set<PricePolicy>();
    public DbSet<PublicPage> PublicPages => Set<PublicPage>();
    public DbSet<JobPosting> JobPostings => Set<JobPosting>();
    public DbSet<ProjectTask> ProjectTasks => Set<ProjectTask>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<ClientAsset> ClientAssets => Set<ClientAsset>();
    public DbSet<ClientAccountEntry> ClientAccountEntries => Set<ClientAccountEntry>();
    public DbSet<InvoicePayment> InvoicePayments => Set<InvoicePayment>();
    public DbSet<ClientAssetType> ClientAssetTypes => Set<ClientAssetType>();
    public DbSet<FormTemplate> FormTemplates => Set<FormTemplate>();
    public DbSet<FormField> FormFields => Set<FormField>();
    public DbSet<FormAction> FormActions => Set<FormAction>();
    public DbSet<FormSubmission> FormSubmissions => Set<FormSubmission>();
    public DbSet<FormAnswer> FormAnswers => Set<FormAnswer>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Tenant>(e =>
        {
            e.HasIndex(t => t.Slug).IsUnique();
            // Restrict, not cascade: deleting a plan must never take paying tenants with it.
            e.HasOne(t => t.Plan).WithMany(p => p.Tenants)
                .HasForeignKey(t => t.PlanId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ApplicationUser>(e =>
        {
            e.HasOne(u => u.Tenant).WithMany(t => t.Users).HasForeignKey(u => u.TenantId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<TenantMembership>(e =>
        {
            e.HasOne(m => m.User).WithMany(u => u.Memberships)
                .HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);

            // Losing the company takes the membership, never the person: someone who worked
            // there still has their own personal space and whatever else they belong to.
            e.HasOne(m => m.Tenant).WithMany()
                .HasForeignKey(m => m.TenantId).OnDelete(DeleteBehavior.Cascade);

            // SetNull, not Cascade: losing the client record must not silently delete the
            // membership row and leave an account pointing at a space it can no longer be
            // scoped to. The grant is revoked explicitly instead.
            e.HasOne(m => m.Client).WithMany()
                .HasForeignKey(m => m.ClientId).OnDelete(DeleteBehavior.SetNull);

            e.HasIndex(m => new { m.UserId, m.TenantId }).IsUnique();

            // No query filter on purpose: this is what answers "which spaces may I enter?",
            // asked before any space is current. See TenantMembership.
        });

        // Plans and modules are platform-wide content, not tenant data: no query filter.
        builder.Entity<Plan>(e =>
        {
            e.HasIndex(p => p.SortOrder);
            e.HasMany(p => p.Modules).WithMany(m => m.Plans);
        });

        builder.Entity<Module>(e =>
        {
            e.Property(m => m.NavHref).HasMaxLength(100);

            // Restrict, not cascade: deleting a parent must not silently take its children's
            // sidebar entries with it. They are untied first, deliberately.
            e.HasOne(m => m.ParentModule).WithMany(m => m.Children)
                .HasForeignKey(m => m.ParentModuleId).OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(m => m.SortOrder);
        });

        builder.Entity<MediaAsset>(e =>
        {
            e.HasOne(m => m.Tenant).WithMany().HasForeignKey(m => m.TenantId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(m => m.ObjectKey).IsUnique();
            e.HasIndex(m => new { m.TenantId, m.CreatedAt });
            e.HasQueryFilter(m => m.TenantId == CurrentTenantId);
        });

        builder.Entity<Client>(e =>
        {
            e.HasOne(c => c.Tenant).WithMany(t => t.Clients).HasForeignKey(c => c.TenantId).OnDelete(DeleteBehavior.Cascade);
            e.Property(c => c.CompanyName).HasMaxLength(200);
            e.Property(c => c.FirstName).HasMaxLength(100);
            e.Property(c => c.LastName).HasMaxLength(100);

            // Unique so a race between two simultaneous creations fails loudly instead of
            // quietly handing two clients the same number.
            e.HasIndex(c => new { c.TenantId, c.Number }).IsUnique();

            // SetNull, like the employee's own link: revoking access deletes the account and the
            // client stays on file. Without it the foreign key refuses the delete and revoking
            // an access is impossible.
            e.HasOne(c => c.User).WithMany().HasForeignKey(c => c.UserId).OnDelete(DeleteBehavior.SetNull);

            // Client, not Prospect: every record that existed before this column is one the
            // company already serves, and a migration that turned them all into leads would be
            // a lie about the whole file.
            //
            // The sentinel has to be moved off zero, and this is not a detail. EF omits a column
            // from an INSERT when the value equals the sentinel — which defaults to default(T),
            // and default(ClientStatus) is Prospect. Left alone, every client created as a
            // prospect would be written as a client instead, silently, and the form would look
            // like it had worked. A value no member has means "really unset", so Prospect is
            // sent like any other.
            e.Property(c => c.Status)
                .HasDefaultValue(ClientStatus.Client)
                .HasSentinel((ClientStatus)(-1));

            e.HasQueryFilter(c => c.TenantId == CurrentTenantId
                && (CurrentClientId == null || c.Id == CurrentClientId));
        });

        builder.Entity<ClientAsset>(e =>
        {
            e.HasOne(a => a.Client).WithMany(c => c.Assets)
                .HasForeignKey(a => a.ClientId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: losing an address must not delete the building that stood at it.
            e.HasOne(a => a.Address).WithMany()
                .HasForeignKey(a => a.AddressId).OnDelete(DeleteBehavior.SetNull);

            // Restrict: a type still in use cannot be deleted out from under its assets, which
            // would leave rows claiming a kind that no longer exists. The endpoint refuses it
            // with the count, so the message names what is in the way.
            e.HasOne(a => a.AssetType).WithMany(t => t.Assets)
                .HasForeignKey(a => a.AssetTypeId).OnDelete(DeleteBehavior.Restrict);

            e.Property(a => a.Label).HasMaxLength(200);
            e.Property(a => a.Make).HasMaxLength(80);
            e.Property(a => a.Model).HasMaxLength(80);
            e.Property(a => a.SerialNumber).HasMaxLength(80);
            e.Property(a => a.Reference).HasMaxLength(60);
            e.Property(a => a.UsageUnit).HasMaxLength(20);
            e.Property(a => a.Notes).HasMaxLength(2000);
            e.Property(a => a.Usage).HasPrecision(14, 2);

            e.HasIndex(a => a.ClientId);

            // Searched by the number stamped on the thing, which is how a counter clerk finds a
            // car when the customer gives a plate and not a name.
            e.HasIndex(a => new { a.TenantId, a.SerialNumber });
            e.HasIndex(a => new { a.TenantId, a.Reference });

            // Follows the client's own filter: a signed-in customer sees their own assets and
            // nobody else's, which is the same promise the client record itself makes.
            e.HasQueryFilter(a => a.TenantId == CurrentTenantId
                && (CurrentClientId == null || a.ClientId == CurrentClientId));
        });

        builder.Entity<ClientAccountEntry>(e =>
        {
            e.HasOne(x => x.Client).WithMany(c => c.AccountEntries)
                .HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.Cascade);

            // SetNull, not Cascade: the client still owes the money after somebody deletes a
            // draft invoice, and an account that quietly rebalances itself when a document is
            // tidied up is an account nobody can reconcile.
            e.HasOne(x => x.Invoice).WithMany()
                .HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.SetNull);

            e.Property(x => x.Amount).HasPrecision(14, 2);
            e.Property(x => x.Description).HasMaxLength(300);

            // The statement is read in date order, newest first, for one client at a time.
            e.HasIndex(x => new { x.ClientId, x.Date });

            e.HasQueryFilter(x => x.TenantId == CurrentTenantId
                && (CurrentClientId == null || x.ClientId == CurrentClientId));
        });

        builder.Entity<InvoicePayment>(e =>
        {
            e.HasOne(p => p.Invoice).WithMany()
                .HasForeignKey(p => p.InvoiceId).OnDelete(DeleteBehavior.Cascade);

            e.Property(p => p.Amount).HasPrecision(14, 2);
            e.Property(p => p.Reference).HasMaxLength(80);
            e.Property(p => p.Note).HasMaxLength(300);

            e.HasIndex(p => new { p.InvoiceId, p.Date });

            // Follows the invoice's own filter, so a customer reading their own invoice sees
            // what they have paid on it and nothing from anybody else's.
            e.HasQueryFilter(p => p.TenantId == CurrentTenantId
                && (CurrentClientId == null || p.Invoice!.ClientId == CurrentClientId));
        });

        builder.Entity<ClientContact>(e =>
        {
            e.HasOne(c => c.Client).WithMany(c => c.Contacts).HasForeignKey(c => c.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.Property(c => c.FirstName).HasMaxLength(100);
            e.Property(c => c.LastName).HasMaxLength(100);
            e.Property(c => c.Role).HasMaxLength(100);
            e.Property(c => c.Email).HasMaxLength(256);
            e.Property(c => c.Phone).HasMaxLength(40);
            e.HasIndex(c => c.ClientId);
            e.HasOne(c => c.User).WithMany().HasForeignKey(c => c.UserId).OnDelete(DeleteBehavior.SetNull);

            e.HasQueryFilter(c => c.TenantId == CurrentTenantId
                && (CurrentClientId == null || c.ClientId == CurrentClientId));
        });

        builder.Entity<Address>(e =>
        {
            e.HasOne(a => a.Client).WithMany(c => c.Addresses).HasForeignKey(a => a.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(a => a.TenantId == CurrentTenantId
                && (CurrentClientId == null || a.ClientId == CurrentClientId));
        });

        builder.Entity<Project>(e =>
        {
            e.HasOne(p => p.Client).WithMany(c => c.Projects).HasForeignKey(p => p.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.Property(p => p.Budget).HasPrecision(14, 2);
            e.Property(p => p.PoNumber).HasMaxLength(60);

            // Unique so a race between two simultaneous creations fails loudly instead of
            // quietly handing two projects the same number.
            e.HasIndex(p => new { p.TenantId, p.Number }).IsUnique();

            // SetNull: deleting an address must not take the project with it. The project keeps
            // its history and simply has no address on file until one is chosen again.
            e.HasOne(p => p.ClientAddress).WithMany()
                .HasForeignKey(p => p.ClientAddressId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(p => p.SiteAddress).WithMany()
                .HasForeignKey(p => p.SiteAddressId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(p => p.PricePolicy).WithMany()
                .HasForeignKey(p => p.PricePolicyId).OnDelete(DeleteBehavior.SetNull);

            // SetNull: selling the car must not delete the jobs done on it.
            e.HasOne(p => p.ClientAsset).WithMany()
                .HasForeignKey(p => p.ClientAssetId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(p => p.TenantId == CurrentTenantId
                && (CurrentClientId == null || p.ClientId == CurrentClientId));
        });

        builder.Entity<Invoice>(e =>
        {
            e.HasOne(i => i.Client).WithMany(c => c.Invoices).HasForeignKey(i => i.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.Project).WithMany(p => p.Invoices).HasForeignKey(i => i.ProjectId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(i => new { i.TenantId, i.Number }).IsUnique();

            // SetNull: retiring a policy must not take the invoices priced with it.
            e.HasOne(i => i.PricePolicy).WithMany()
                .HasForeignKey(i => i.PricePolicyId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(i => i.TenantId == CurrentTenantId
                && (CurrentClientId == null || i.ClientId == CurrentClientId));
        });

        builder.Entity<InvoiceLine>(e =>
        {
            e.HasOne(l => l.Invoice).WithMany(i => i.Lines).HasForeignKey(l => l.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            e.Property(l => l.Quantity).HasPrecision(14, 3);
            e.Property(l => l.UnitPrice).HasPrecision(14, 2);
            e.Property(l => l.PurchasePrice).HasPrecision(14, 2);
            e.Property(l => l.MarginPercent).HasPrecision(6, 3);

            // SetNull: a sold line outlives the catalogue entry it came from.
            e.HasOne(l => l.Product).WithMany()
                .HasForeignKey(l => l.ProductId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(l => l.Invoice!.TenantId == CurrentTenantId
                && (CurrentClientId == null || l.Invoice!.ClientId == CurrentClientId));
        });

        builder.Entity<ExpenseType>(e =>
        {
            e.Property(t => t.Name).HasMaxLength(100);

            // One list per company, no duplicates in it: two categories with the same name are
            // two people filing the same thing in two places.
            e.HasIndex(t => new { t.TenantId, t.Name }).IsUnique();
            e.HasQueryFilter(t => t.TenantId == CurrentTenantId);
        });

        builder.Entity<ClientAssetType>(e =>
        {
            e.Property(t => t.Name).HasMaxLength(100);
            e.Property(t => t.Icon).HasMaxLength(40);

            // One list per company, no duplicates in it — the same rule as an expense category,
            // for the same reason: two names for one kind is two people filing in two places.
            e.HasIndex(t => new { t.TenantId, t.Name }).IsUnique();
            e.HasQueryFilter(t => t.TenantId == CurrentTenantId);
        });

        builder.Entity<FormTemplate>(e =>
        {
            e.Property(f => f.Title).HasMaxLength(200);
            e.Property(f => f.Description).HasMaxLength(1000);
            e.Property(f => f.SuccessMessage).HasMaxLength(500);

            e.HasIndex(f => new { f.TenantId, f.SortOrder });
            e.HasQueryFilter(f => f.TenantId == CurrentTenantId);
        });

        builder.Entity<FormField>(e =>
        {
            e.HasOne(f => f.FormTemplate).WithMany(t => t.Fields)
                .HasForeignKey(f => f.FormTemplateId).OnDelete(DeleteBehavior.Cascade);

            e.Property(f => f.Label).HasMaxLength(300);
            e.Property(f => f.HelpText).HasMaxLength(300);
            e.Property(f => f.Options).HasMaxLength(2000);

            e.HasIndex(f => new { f.FormTemplateId, f.SortOrder });
            e.HasQueryFilter(f => f.TenantId == CurrentTenantId);
        });

        builder.Entity<FormAction>(e =>
        {
            e.HasOne(a => a.FormTemplate).WithMany(t => t.Actions)
                .HasForeignKey(a => a.FormTemplateId).OnDelete(DeleteBehavior.Cascade);

            e.Property(a => a.Recipients).HasMaxLength(500);
            e.Property(a => a.Subject).HasMaxLength(200);

            e.HasIndex(a => new { a.FormTemplateId, a.SortOrder });
            e.HasQueryFilter(a => a.TenantId == CurrentTenantId);
        });

        builder.Entity<FormSubmission>(e =>
        {
            e.HasOne(s => s.FormTemplate).WithMany(t => t.Submissions)
                .HasForeignKey(s => s.FormTemplateId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: deleting the client a form brought in must not delete the form that
            // brought them in, which is often the only record of where they came from.
            e.HasOne(s => s.CreatedClient).WithMany()
                .HasForeignKey(s => s.CreatedClientId).OnDelete(DeleteBehavior.SetNull);

            e.Property(s => s.SubmittedByName).HasMaxLength(200);
            e.Property(s => s.ActionLog).HasMaxLength(1000);

            e.HasIndex(s => new { s.FormTemplateId, s.CreatedAt });
            e.HasQueryFilter(s => s.TenantId == CurrentTenantId);
        });

        builder.Entity<FormAnswer>(e =>
        {
            e.HasOne(a => a.Submission).WithMany(s => s.Answers)
                .HasForeignKey(a => a.SubmissionId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: deleting a question must not delete the answers already given to it.
            // They carry their own copy of the label, so they stay readable without it.
            e.HasOne(a => a.FormField).WithMany()
                .HasForeignKey(a => a.FormFieldId).OnDelete(DeleteBehavior.SetNull);

            e.Property(a => a.Label).HasMaxLength(300);
            e.Property(a => a.Value).HasMaxLength(4000);

            e.HasIndex(a => new { a.SubmissionId, a.SortOrder });
            e.HasQueryFilter(a => a.TenantId == CurrentTenantId);
        });

        builder.Entity<ProjectExpense>(e =>
        {
            e.HasOne(x => x.Project).WithMany(p => p.Expenses)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);

            // Restrict: a category still in use cannot be deleted out from under its expenses,
            // which would leave rows claiming a type that no longer exists.
            e.HasOne(x => x.ExpenseType).WithMany(t => t.Expenses)
                .HasForeignKey(x => x.ExpenseTypeId).OnDelete(DeleteBehavior.Restrict);

            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Cost).HasPrecision(14, 2);
            e.Property(x => x.SellingPrice).HasPrecision(14, 2);

            e.HasIndex(x => new { x.ProjectId, x.CreatedAt });

            // A customer reads their own project's record, so the expense filter follows the
            // project's: tenant, and the client's own rows when a client is signed in.
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId
                && (CurrentClientId == null || x.Project!.ClientId == CurrentClientId));
        });

        builder.Entity<ProjectMaterial>(e =>
        {
            e.HasOne(m => m.Project).WithMany(p => p.Materials)
                .HasForeignKey(m => m.ProjectId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: what a job consumed outlives the catalogue entry it was taken from.
            e.HasOne(m => m.Product).WithMany()
                .HasForeignKey(m => m.ProductId).OnDelete(DeleteBehavior.SetNull);

            e.Property(m => m.Code).HasMaxLength(60);
            e.Property(m => m.Description).HasMaxLength(500);
            e.Property(m => m.Unit).HasMaxLength(20);
            e.Property(m => m.Quantity).HasPrecision(14, 3);
            e.Property(m => m.PurchasePrice).HasPrecision(14, 2);
            e.Property(m => m.MarginPercent).HasPrecision(6, 3);
            e.Property(m => m.UnitPrice).HasPrecision(14, 2);

            e.HasIndex(m => new { m.ProjectId, m.SortOrder });

            // Follows the project's own filter, like an expense: the tenant, and the client's
            // own rows when a customer is signed in.
            e.HasQueryFilter(m => m.TenantId == CurrentTenantId
                && (CurrentClientId == null || m.Project!.ClientId == CurrentClientId));
        });

        builder.Entity<ProjectTask>(e =>
        {
            e.HasOne(t => t.Project).WithMany(p => p.Tasks)
                .HasForeignKey(t => t.ProjectId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: disbanding a crew must leave the work it was given standing, unassigned.
            e.HasOne(t => t.AssignedTeam).WithMany()
                .HasForeignKey(t => t.AssignedTeamId).OnDelete(DeleteBehavior.SetNull);

            // The named people a task went to. Cascade from both sides is what a join table
            // wants: removing an employee or deleting the task should take the link, and only
            // the link, with it.
            e.HasMany(t => t.Assignees).WithMany()
                .UsingEntity("ProjectTaskAssignees");

            e.Property(t => t.Title).HasMaxLength(200);
            e.Property(t => t.Description).HasMaxLength(2000);
            e.Property(t => t.EstimatedHours).HasPrecision(8, 2);

            e.HasIndex(t => new { t.ProjectId, t.SortOrder });

            // A task is work for the company, never something a customer reads: no client
            // clause, so a signed-in customer sees none of them at all.
            e.HasQueryFilter(t => t.TenantId == CurrentTenantId);
        });

        // Platform-wide content like plans and modules: no tenant filter. Which reports a
        // company may open follows from its plan's modules, decided where they are listed.
        builder.Entity<Report>(e =>
        {
            // Restrict: a module still carrying reports is untied from them on purpose.
            e.HasOne(r => r.Module).WithMany()
                .HasForeignKey(r => r.ModuleId).OnDelete(DeleteBehavior.Restrict);

            e.Property(r => r.Key).HasMaxLength(60);
            e.Property(r => r.Title).HasMaxLength(120);
            e.Property(r => r.Description).HasMaxLength(500);
            e.Property(r => r.Icon).HasMaxLength(40);

            e.HasIndex(r => new { r.ModuleId, r.SortOrder });
        });

        builder.Entity<TimesheetEntry>(e =>
        {
            e.HasOne(t => t.Project).WithMany(p => p.Timesheets)
                .HasForeignKey(t => t.ProjectId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: taking someone off the payroll must not delete the hours billed for
            // them. The entry then reads as hours with no name, which is the truth.
            e.HasOne(t => t.Employee).WithMany()
                .HasForeignKey(t => t.EmployeeId).OnDelete(DeleteBehavior.SetNull);

            e.Property(t => t.Hours).HasPrecision(8, 2);
            e.Property(t => t.Note).HasMaxLength(500);

            e.HasIndex(t => new { t.ProjectId, t.StartDate });
            e.HasQueryFilter(t => t.TenantId == CurrentTenantId
                && (CurrentClientId == null || t.Project!.ClientId == CurrentClientId));
        });

        builder.Entity<ProjectDocument>(e =>
        {
            e.HasOne(d => d.Project).WithMany(p => p.Documents)
                .HasForeignKey(d => d.ProjectId).OnDelete(DeleteBehavior.Cascade);

            // Cascade on the asset, like an HR document: a row whose file is gone is a broken
            // link offered as a document.
            e.HasOne(d => d.MediaAsset).WithMany()
                .HasForeignKey(d => d.MediaAssetId).OnDelete(DeleteBehavior.Cascade);

            e.Property(d => d.Title).HasMaxLength(200);
            e.Property(d => d.Category).HasMaxLength(100);

            e.HasIndex(d => new { d.ProjectId, d.CreatedAt });
            e.HasQueryFilter(d => d.TenantId == CurrentTenantId
                && (CurrentClientId == null || d.Project!.ClientId == CurrentClientId));
        });

        builder.Entity<ProjectNote>(e =>
        {
            e.HasOne(n => n.Project).WithMany(p => p.Notes)
                .HasForeignKey(n => n.ProjectId).OnDelete(DeleteBehavior.Cascade);

            e.Property(n => n.Body).HasMaxLength(4000);

            e.HasIndex(n => new { n.ProjectId, n.CreatedAt });
            e.HasQueryFilter(n => n.TenantId == CurrentTenantId
                && (CurrentClientId == null || n.Project!.ClientId == CurrentClientId));
        });

        builder.Entity<ProjectExpensePhoto>(e =>
        {
            e.HasOne(p => p.Expense).WithMany(x => x.Photos)
                .HasForeignKey(p => p.ExpenseId).OnDelete(DeleteBehavior.Cascade);

            // Cascade, like an HR document: a photo row whose file is gone shows a broken frame
            // and proves nothing.
            e.HasOne(p => p.MediaAsset).WithMany()
                .HasForeignKey(p => p.MediaAssetId).OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(p => new { p.ExpenseId, p.SortOrder });
            e.HasQueryFilter(p => p.TenantId == CurrentTenantId
                && (CurrentClientId == null || p.Expense!.Project!.ClientId == CurrentClientId));
        });

        builder.Entity<PricePolicy>(e =>
        {
            e.Property(p => p.Name).HasMaxLength(100);
            e.Property(p => p.Description).HasMaxLength(500);
            e.Property(p => p.MarginPercent).HasPrecision(6, 3);
            e.HasIndex(p => new { p.TenantId, p.Name }).IsUnique();
            e.HasQueryFilter(p => p.TenantId == CurrentTenantId);
        });

        builder.Entity<ProductCategory>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(100);
            e.HasIndex(c => new { c.TenantId, c.Name }).IsUnique();
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        builder.Entity<ProductSubCategory>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(100);

            // Cascade: a sub-category has no meaning without its category, and the products
            // that used it keep their own category.
            e.HasOne(c => c.Category).WithMany(c => c.SubCategories)
                .HasForeignKey(c => c.CategoryId).OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(c => new { c.CategoryId, c.Name }).IsUnique();
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        builder.Entity<Product>(e =>
        {
            e.Property(p => p.Code).HasMaxLength(60);
            e.Property(p => p.Title).HasMaxLength(200);
            e.Property(p => p.Description).HasMaxLength(4000);
            e.Property(p => p.Barcode).HasMaxLength(64);
            e.Property(p => p.Unit).HasMaxLength(20);
            e.Property(p => p.Note).HasMaxLength(4000);
            e.Property(p => p.PurchasePrice).HasPrecision(14, 2);
            e.Property(p => p.SellingPrice).HasPrecision(14, 2);
            e.Property(p => p.MarginPercent).HasPrecision(6, 3);
            e.Property(p => p.QuantityOnHand).HasPrecision(14, 3);
            e.Property(p => p.MinimumQuantity).HasPrecision(14, 3);
            e.Property(p => p.MaximumQuantity).HasPrecision(14, 3);

            // SetNull, not Restrict: tidying up a category must not refuse because something
            // still uses it, and a product without a category is a product, not an error.
            e.HasOne(p => p.Category).WithMany(c => c.Products)
                .HasForeignKey(p => p.CategoryId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(p => p.SubCategory).WithMany(c => c.Products)
                .HasForeignKey(p => p.SubCategoryId).OnDelete(DeleteBehavior.SetNull);

            // Restrict: deleting a product that has variants would take real stock with it, so
            // the variants are dealt with first, deliberately.
            e.HasOne(p => p.ParentProduct).WithMany(p => p.Variants)
                .HasForeignKey(p => p.ParentProductId).OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(p => new { p.TenantId, p.Number }).IsUnique();
            e.HasIndex(p => new { p.TenantId, p.Barcode });
            e.HasQueryFilter(p => p.TenantId == CurrentTenantId);
        });

        builder.Entity<ProductImage>(e =>
        {
            e.HasOne(i => i.Product).WithMany(p => p.Images)
                .HasForeignKey(i => i.ProductId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.MediaAsset).WithMany()
                .HasForeignKey(i => i.MediaAssetId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(i => new { i.ProductId, i.SortOrder });
            e.HasQueryFilter(i => i.TenantId == CurrentTenantId);
        });

        builder.Entity<ProductPriceEntry>(e =>
        {
            e.HasOne(h => h.Product).WithMany(p => p.PriceHistory)
                .HasForeignKey(h => h.ProductId).OnDelete(DeleteBehavior.Cascade);
            e.Property(h => h.PurchasePrice).HasPrecision(14, 2);
            e.Property(h => h.SellingPrice).HasPrecision(14, 2);
            e.Property(h => h.MarginPercent).HasPrecision(6, 3);
            e.HasIndex(h => new { h.ProductId, h.CreatedAt });
            e.HasQueryFilter(h => h.TenantId == CurrentTenantId);
        });

        builder.Entity<ProductStockEntry>(e =>
        {
            e.HasOne(h => h.Product).WithMany(p => p.StockHistory)
                .HasForeignKey(h => h.ProductId).OnDelete(DeleteBehavior.Cascade);
            e.Property(h => h.QuantityChange).HasPrecision(14, 3);
            e.Property(h => h.QuantityAfter).HasPrecision(14, 3);
            e.Property(h => h.Reason).HasMaxLength(200);
            e.HasIndex(h => new { h.ProductId, h.CreatedAt });
            e.HasQueryFilter(h => h.TenantId == CurrentTenantId);
        });

        builder.Entity<PublicPage>(e =>
        {
            e.HasKey(p => p.TenantId);
            e.HasOne(p => p.Tenant).WithOne()
                .HasForeignKey<PublicPage>(p => p.TenantId).OnDelete(DeleteBehavior.Cascade);
            e.Property(p => p.Headline).HasMaxLength(200);
            e.Property(p => p.About).HasMaxLength(4000);
            e.Property(p => p.ContactNote).HasMaxLength(1000);

            // No query filter: this page is read by a visitor with no session at all, scoped by
            // the slug in the route — the same way the company's logo is.
        });

        builder.Entity<JobPosting>(e =>
        {
            e.Property(j => j.Title).HasMaxLength(200);
            e.Property(j => j.Description).HasMaxLength(4000);
            e.Property(j => j.Location).HasMaxLength(200);
            e.Property(j => j.Compensation).HasMaxLength(200);
            e.Property(j => j.ApplyTo).HasMaxLength(300);
            e.HasIndex(j => new { j.TenantId, j.CreatedAt });

            // No query filter, for the same reason as the page it appears on. Every staff query
            // scopes by tenant explicitly.
        });

        builder.Entity<PlatformSetting>(e =>
        {
            e.HasKey(s => s.Key);
        });

        builder.Entity<Employee>(e =>
        {
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);

            // SetNull, not Cascade: deleting the sign-in account is how access is revoked, and it
            // must leave the employee on file rather than erase them from the payroll.
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);

            e.Property(x => x.FirstName).HasMaxLength(100);
            e.Property(x => x.LastName).HasMaxLength(100);
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.JobTitle).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(40);
            e.Property(x => x.InvitationTokenHash).HasMaxLength(64);

            // Stated as a database default rather than left to the CLR one. UserRole's zero is
            // SuperAdmin, so the column would otherwise have been added to every employee
            // already on file carrying the platform's own role.
            e.Property(x => x.Role).HasDefaultValue(UserRole.TenantUser);

            e.HasIndex(x => new { x.TenantId, x.Email }).IsUnique();

            // Looked up by hash on every invitation link that is opened, by someone with no
            // session and therefore no tenant to narrow the search.
            e.HasIndex(x => x.InvitationTokenHash);

            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        builder.Entity<Team>(e =>
        {
            e.Property(t => t.Name).HasMaxLength(100);

            // SetNull, not Cascade: a team outlives the person who used to run it.
            e.HasOne(t => t.LeadEmployee).WithMany()
                .HasForeignKey(t => t.LeadEmployeeId).OnDelete(DeleteBehavior.SetNull);

            e.HasMany(t => t.Members).WithMany(x => x.Teams);
            e.HasIndex(t => new { t.TenantId, t.Name }).IsUnique();
            e.HasQueryFilter(t => t.TenantId == CurrentTenantId);
        });

        builder.Entity<CompanyLocation>(e =>
        {
            e.Property(l => l.Label).HasMaxLength(100);
            e.Property(l => l.Line1).HasMaxLength(200);
            e.Property(l => l.Line2).HasMaxLength(100);
            e.Property(l => l.City).HasMaxLength(120);
            e.Property(l => l.Province).HasMaxLength(80);
            e.Property(l => l.PostalCode).HasMaxLength(20);
            e.Property(l => l.Country).HasMaxLength(80);
            e.Property(l => l.Phone).HasMaxLength(40);
            e.HasQueryFilter(l => l.TenantId == CurrentTenantId);
        });

        builder.Entity<HrDocument>(e =>
        {
            e.Property(d => d.Title).HasMaxLength(200);
            e.Property(d => d.Category).HasMaxLength(100);

            // A document without its file is a broken promise, so removing the asset removes
            // the row. Losing the employee only unfiles it — the document itself still matters.
            e.HasOne(d => d.MediaAsset).WithMany()
                .HasForeignKey(d => d.MediaAssetId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(d => d.Employee).WithMany()
                .HasForeignKey(d => d.EmployeeId).OnDelete(DeleteBehavior.SetNull);

            e.HasIndex(d => new { d.TenantId, d.CreatedAt });
            e.HasQueryFilter(d => d.TenantId == CurrentTenantId);
        });

        builder.Entity<BillingSettings>(e =>
        {
            e.HasKey(b => b.TenantId);
            e.HasOne(b => b.Tenant).WithOne()
                .HasForeignKey<BillingSettings>(b => b.TenantId).OnDelete(DeleteBehavior.Cascade);

            e.Property(b => b.GstNumber).HasMaxLength(40);
            e.Property(b => b.QstNumber).HasMaxLength(40);
            e.Property(b => b.InvoicePrefix).HasMaxLength(10);
            e.Property(b => b.Currency).HasMaxLength(3);
            e.Property(b => b.InvoiceEmailSubject).HasMaxLength(300);
            e.Property(b => b.InvoiceEmailBody).HasMaxLength(8000);
            e.Property(b => b.GstRate).HasPrecision(6, 3);
            e.Property(b => b.QstRate).HasPrecision(6, 3);
            e.Property(b => b.DefaultHourlyRate).HasPrecision(14, 2);
            e.HasOne(b => b.DefaultPricePolicy).WithMany()
                .HasForeignKey(b => b.DefaultPricePolicyId).OnDelete(DeleteBehavior.SetNull);
            e.Property(b => b.Terms).HasMaxLength(2000);
            e.Property(b => b.FooterNote).HasMaxLength(2000);

            // No query filter: keyed by tenant id and only ever read for the current one, like
            // the logo. A filter here would hide the row from the very request that needs it
            // during sign-up, before a tenant claim exists.
        });

        builder.Entity<TenantLogo>(e =>
        {
            e.HasKey(l => l.TenantId);
            e.HasOne(l => l.Tenant).WithOne(t => t.Logo)
                .HasForeignKey<TenantLogo>(l => l.TenantId).OnDelete(DeleteBehavior.Cascade);
            e.Property(l => l.ContentType).HasMaxLength(100);
            e.Property(l => l.ETag).HasMaxLength(64);
            // No query filter: the logo is fetched by tenant id from a route that has no session
            // to filter on, the same way the platform's branding is.
        });

        builder.Entity<Tenant>(e =>
        {
            e.Property(t => t.ContactEmail).HasMaxLength(256);
            e.Property(t => t.Phone).HasMaxLength(40);
            // #RRGGBB, validated on the way in.
            e.Property(t => t.BrandColor).HasMaxLength(7);
        });

        // Platform-wide branding, like Plan and Module: no tenant query filter, because every
        // tenant and every anonymous visitor sees the same logo.
        builder.Entity<BrandingAsset>(e =>
        {
            e.HasKey(a => a.Slot);
            e.Property(a => a.Slot).HasMaxLength(32);
            e.Property(a => a.ContentType).HasMaxLength(100);
            e.Property(a => a.ETag).HasMaxLength(64);
        });
    }
}
