﻿﻿﻿using Microsoft.AspNetCore.Http;
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
    public DbSet<Feature> Features => Set<Feature>();
    public DbSet<TenantAiSettings> TenantAiSettings => Set<TenantAiSettings>();
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
    public DbSet<ProjectExtraCharge> ProjectExtraCharges => Set<ProjectExtraCharge>();
    public DbSet<ProjectMaterial> ProjectMaterials => Set<ProjectMaterial>();
    public DbSet<TimesheetEntry> TimesheetEntries => Set<TimesheetEntry>();
    public DbSet<ProjectDocument> ProjectDocuments => Set<ProjectDocument>();
    public DbSet<ProjectNote> ProjectNotes => Set<ProjectNote>();
    public DbSet<ExpenseType> ExpenseTypes => Set<ExpenseType>();
    public DbSet<ProjectExpensePhoto> ProjectExpensePhotos => Set<ProjectExpensePhoto>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<ProductSubCategory> ProductSubCategories => Set<ProductSubCategory>();
    public DbSet<ProjectCategory> ProjectCategories => Set<ProjectCategory>();
    public DbSet<ProjectSubCategory> ProjectSubCategories => Set<ProjectSubCategory>();
    public DbSet<WageClassification> WageClassifications => Set<WageClassification>();
    public DbSet<WageClassificationStep> WageClassificationSteps => Set<WageClassificationStep>();
    public DbSet<Quote> Quotes => Set<Quote>();
    public DbSet<QuoteLine> QuoteLines => Set<QuoteLine>();
    public DbSet<QuoteDocument> QuoteDocuments => Set<QuoteDocument>();
    public DbSet<QuoteNote> QuoteNotes => Set<QuoteNote>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<ProductPriceEntry> ProductPriceEntries => Set<ProductPriceEntry>();
    public DbSet<ProductStockEntry> ProductStockEntries => Set<ProductStockEntry>();
    public DbSet<PricePolicy> PricePolicies => Set<PricePolicy>();
    public DbSet<PricePolicyTier> PricePolicyTiers => Set<PricePolicyTier>();
    public DbSet<PublicPage> PublicPages => Set<PublicPage>();
    public DbSet<JobPosting> JobPostings => Set<JobPosting>();

    // Keyed by the user and carrying no tenant: these belong to a person, not a company. Every
    // query against them names the user, because there is no filter that could.
    public DbSet<PersonalProfile> PersonalProfiles => Set<PersonalProfile>();
    public DbSet<PersonalExperience> PersonalExperiences => Set<PersonalExperience>();
    public DbSet<PersonalEducation> PersonalEducation => Set<PersonalEducation>();
    public DbSet<JobPostingDocument> JobPostingDocuments => Set<JobPostingDocument>();
    public DbSet<ProjectTask> ProjectTasks => Set<ProjectTask>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<ClientAsset> ClientAssets => Set<ClientAsset>();
    public DbSet<ClientAccountEntry> ClientAccountEntries => Set<ClientAccountEntry>();
    public DbSet<InvoicePayment> InvoicePayments => Set<InvoicePayment>();
    public DbSet<InvoiceRefund> InvoiceRefunds => Set<InvoiceRefund>();
    public DbSet<InvoiceCredit> InvoiceCredits => Set<InvoiceCredit>();
    public DbSet<ClientAssetType> ClientAssetTypes => Set<ClientAssetType>();
    public DbSet<Gallery> Galleries => Set<Gallery>();
    public DbSet<GalleryImage> GalleryImages => Set<GalleryImage>();
    public DbSet<PublicPageSection> PublicPageSections => Set<PublicPageSection>();
    public DbSet<CustomerOrder> CustomerOrders => Set<CustomerOrder>();
    public DbSet<CustomerOrderLine> CustomerOrderLines => Set<CustomerOrderLine>();
    public DbSet<FormTemplate> FormTemplates => Set<FormTemplate>();
    public DbSet<FormField> FormFields => Set<FormField>();
    public DbSet<FormAction> FormActions => Set<FormAction>();
    public DbSet<FormSubmission> FormSubmissions => Set<FormSubmission>();
    public DbSet<FormAnswer> FormAnswers => Set<FormAnswer>();
    public DbSet<ReceiptScan> ReceiptScans => Set<ReceiptScan>();
    public DbSet<EmployeeAddress> EmployeeAddresses => Set<EmployeeAddress>();
    public DbSet<EmergencyContact> EmergencyContacts => Set<EmergencyContact>();
    public DbSet<EmployeeWage> EmployeeWages => Set<EmployeeWage>();
    public DbSet<HourBankEntry> HourBankEntries => Set<HourBankEntry>();
    public DbSet<LeaveRequest> LeaveRequests => Set<LeaveRequest>();
    public DbSet<ScheduleShift> ScheduleShifts => Set<ScheduleShift>();
    public DbSet<EmployeeCredential> EmployeeCredentials => Set<EmployeeCredential>();
    public DbSet<EmployeeCvEntry> EmployeeCvEntries => Set<EmployeeCvEntry>();
    public DbSet<Candidate> Candidates => Set<Candidate>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
    public DbSet<GoodsReceipt> GoodsReceipts => Set<GoodsReceipt>();
    public DbSet<GoodsReceiptLine> GoodsReceiptLines => Set<GoodsReceiptLine>();

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
            e.HasMany(p => p.Features).WithMany(f => f.Plans);
        });

        builder.Entity<Feature>(e =>
        {
            // The key is what the application checks, so two rows claiming the same one would
            // make "does this plan include the assistant" a question with two answers.
            e.Property(f => f.Key).HasMaxLength(40);
            e.HasIndex(f => f.Key).IsUnique();
            e.HasIndex(f => f.SortOrder);
        });

        builder.Entity<TenantAiSettings>(e =>
        {
            e.HasKey(s => s.TenantId);
            e.Property(s => s.InputPricePerMillion).HasPrecision(12, 4);
            e.Property(s => s.OutputPricePerMillion).HasPrecision(12, 4);
            e.HasOne(s => s.Tenant).WithOne()
                .HasForeignKey<TenantAiSettings>(s => s.TenantId).OnDelete(DeleteBehavior.Cascade);
            e.Property(s => s.Model).HasMaxLength(100);

            // No query filter: this row is read while deciding what the current tenant may do,
            // which is sometimes before the filter's tenant has been established.
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

            // WithMany() and not the client's own Contacts list: that list is the contacts the
            // client owns, and this is one of them being pointed at for another reason.
            e.HasOne(c => c.BillingContact).WithMany()
                .HasForeignKey(c => c.BillingContactId).OnDelete(DeleteBehavior.SetNull);
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

        builder.Entity<InvoiceRefund>(e =>
        {
            e.HasOne(r => r.Invoice).WithMany()
                .HasForeignKey(r => r.InvoiceId).OnDelete(DeleteBehavior.Cascade);

            // SetNull rather than Cascade: a payment entered by mistake can be removed, and the
            // refund of real money that followed it must not vanish with it. It loses the
            // pointer and keeps the amount, the date and the reason.
            e.HasOne(r => r.InvoicePayment).WithMany()
                .HasForeignKey(r => r.InvoicePaymentId).OnDelete(DeleteBehavior.SetNull);

            e.Property(r => r.Amount).HasPrecision(14, 2);
            e.Property(r => r.Reference).HasMaxLength(80);
            e.Property(r => r.Note).HasMaxLength(300);
            e.Property(r => r.StripeRefundId).HasMaxLength(200);

            e.HasIndex(r => new { r.InvoiceId, r.Date });

            // The same filter as the payments it mirrors: a customer reading their own invoice
            // sees what was given back on it, and nothing from anybody else's.
            e.HasQueryFilter(r => r.TenantId == CurrentTenantId
                && (CurrentClientId == null || r.Invoice!.ClientId == CurrentClientId));
        });

        builder.Entity<InvoiceCredit>(e =>
        {
            e.HasOne(c => c.Invoice).WithMany()
                .HasForeignKey(c => c.InvoiceId).OnDelete(DeleteBehavior.Cascade);

            e.Property(c => c.Number).HasMaxLength(20);
            e.Property(c => c.Subtotal).HasPrecision(14, 2);
            e.Property(c => c.Gst).HasPrecision(14, 2);
            e.Property(c => c.Qst).HasPrecision(14, 2);
            e.Property(c => c.Amount).HasPrecision(14, 2);
            e.Property(c => c.Reason).HasMaxLength(300);

            e.HasIndex(c => new { c.InvoiceId, c.Date });

            // Unique per company, the way an invoice number is: two credit notes quoting the
            // same number is a filing problem nobody notices until an audit.
            e.HasIndex(c => new { c.TenantId, c.Number }).IsUnique();

            // A customer reads the credit notes on their own invoices, like the payments and
            // refunds beside them, and nothing from anybody else's.
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId
                && (CurrentClientId == null || c.Invoice!.ClientId == CurrentClientId));
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

            // SetNull, all three: tidying a list of categories or retiring a classification
            // must never take a job with it. The job simply stops being filed there.
            e.HasOne(p => p.Category).WithMany(c => c.Projects)
                .HasForeignKey(p => p.CategoryId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(p => p.SubCategory).WithMany(c => c.Projects)
                .HasForeignKey(p => p.SubCategoryId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(p => p.WageClassification).WithMany(c => c.Projects)
                .HasForeignKey(p => p.WageClassificationId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(p => p.TenantId == CurrentTenantId
                && (CurrentClientId == null || p.ClientId == CurrentClientId));
        });

        builder.Entity<Invoice>(e =>
        {
            e.HasOne(i => i.Client).WithMany(c => c.Invoices).HasForeignKey(i => i.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.Project).WithMany(p => p.Invoices).HasForeignKey(i => i.ProjectId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(i => new { i.TenantId, i.Number }).IsUnique();

            // The whole credential in the payment link. Unique across the platform and not per
            // tenant: it is looked up with no tenant in hand, so a collision between two
            // companies would hand one of them the other's invoice.
            e.Property(i => i.PayToken).HasMaxLength(64);
            e.HasIndex(i => i.PayToken).IsUnique();

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

        builder.Entity<ReceiptScan>(e =>
        {
            // SetNull: deleting the photograph must not erase the fact that a scan was spent on
            // it. The month's count is what the allowance is enforced against, and a count that
            // falls when somebody tidies up their receipts is a count that can be gamed.
            e.HasOne(s => s.MediaAsset).WithMany()
                .HasForeignKey(s => s.MediaAssetId).OnDelete(DeleteBehavior.SetNull);

            e.Property(s => s.Model).HasMaxLength(60);

            // The one index that matters: the allowance is "how many this tenant this month".
            e.HasIndex(s => new { s.TenantId, s.CreatedAt });

            e.HasQueryFilter(s => s.TenantId == CurrentTenantId);
        });

        // ---- The employee's own file ----

        builder.Entity<EmployeeAddress>(e =>
        {
            // Cascade: an address is part of the person's file and means nothing without them.
            e.HasOne(a => a.Employee).WithMany()
                .HasForeignKey(a => a.EmployeeId).OnDelete(DeleteBehavior.Cascade);

            e.Property(a => a.Label).HasMaxLength(60);
            e.Property(a => a.Line1).HasMaxLength(200);
            e.Property(a => a.Line2).HasMaxLength(200);
            e.Property(a => a.City).HasMaxLength(100);
            e.Property(a => a.Province).HasMaxLength(60);
            e.Property(a => a.PostalCode).HasMaxLength(20);
            e.Property(a => a.Country).HasMaxLength(60);

            e.HasIndex(a => new { a.TenantId, a.EmployeeId });
            e.HasQueryFilter(a => a.TenantId == CurrentTenantId);
        });

        builder.Entity<EmergencyContact>(e =>
        {
            e.HasOne(c => c.Employee).WithMany()
                .HasForeignKey(c => c.EmployeeId).OnDelete(DeleteBehavior.Cascade);

            e.Property(c => c.Name).HasMaxLength(150);
            e.Property(c => c.Relationship).HasMaxLength(60);
            e.Property(c => c.Phone).HasMaxLength(40);
            e.Property(c => c.AltPhone).HasMaxLength(40);
            e.Property(c => c.Email).HasMaxLength(256);
            e.Property(c => c.Note).HasMaxLength(1000);

            e.HasIndex(c => new { c.TenantId, c.EmployeeId });
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        builder.Entity<EmployeeWage>(e =>
        {
            e.HasOne(w => w.Employee).WithMany()
                .HasForeignKey(w => w.EmployeeId).OnDelete(DeleteBehavior.Cascade);

            e.Property(w => w.Amount).HasPrecision(14, 2);
            e.Property(w => w.Note).HasMaxLength(300);

            // Read as "the rate in force on this day", which is a descending scan by date.
            e.HasIndex(w => new { w.TenantId, w.EmployeeId, w.EffectiveOn });
            e.HasQueryFilter(w => w.TenantId == CurrentTenantId);
        });

        builder.Entity<HourBankEntry>(e =>
        {
            e.HasOne(h => h.Employee).WithMany()
                .HasForeignKey(h => h.EmployeeId).OnDelete(DeleteBehavior.Cascade);

            e.Property(h => h.Hours).HasPrecision(8, 2);
            e.Property(h => h.Reason).HasMaxLength(300);

            e.HasIndex(h => new { h.TenantId, h.EmployeeId, h.Date });
            e.HasQueryFilter(h => h.TenantId == CurrentTenantId);
        });

        builder.Entity<LeaveRequest>(e =>
        {
            e.HasOne(l => l.Employee).WithMany()
                .HasForeignKey(l => l.EmployeeId).OnDelete(DeleteBehavior.Cascade);

            e.Property(l => l.Hours).HasPrecision(8, 2);
            e.Property(l => l.Note).HasMaxLength(1000);
            e.Property(l => l.DecisionNote).HasMaxLength(1000);

            // The two lists this table is read as: one person's requests, and everything still
            // waiting for an answer.
            e.HasIndex(l => new { l.TenantId, l.EmployeeId, l.StartDate });
            e.HasIndex(l => new { l.TenantId, l.Status });
            e.HasQueryFilter(l => l.TenantId == CurrentTenantId);
        });

        builder.Entity<ScheduleShift>(e =>
        {
            e.HasOne(s => s.Employee).WithMany()
                .HasForeignKey(s => s.EmployeeId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: deleting a job must not wipe the week somebody already worked to.
            e.HasOne(s => s.Project).WithMany()
                .HasForeignKey(s => s.ProjectId).OnDelete(DeleteBehavior.SetNull);

            e.Property(s => s.Note).HasMaxLength(500);

            e.HasIndex(s => new { s.TenantId, s.Date });
            e.HasIndex(s => new { s.TenantId, s.EmployeeId, s.Date });
            e.HasQueryFilter(s => s.TenantId == CurrentTenantId);
        });

        builder.Entity<EmployeeCredential>(e =>
        {
            e.HasOne(c => c.Employee).WithMany()
                .HasForeignKey(c => c.EmployeeId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: losing the scan must not lose the card. The dates are the part that
            // keeps somebody off a site, and they are typed in, not read off the image.
            e.HasOne(c => c.MediaAsset).WithMany()
                .HasForeignKey(c => c.MediaAssetId).OnDelete(DeleteBehavior.SetNull);

            e.Property(c => c.Name).HasMaxLength(200);
            e.Property(c => c.Issuer).HasMaxLength(150);
            e.Property(c => c.Reference).HasMaxLength(100);
            e.Property(c => c.Note).HasMaxLength(1000);

            // What expires next, across the whole company: the one question this table answers
            // that a per-employee list cannot.
            e.HasIndex(c => new { c.TenantId, c.ExpiresOn });
            e.HasIndex(c => new { c.TenantId, c.EmployeeId });
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        builder.Entity<EmployeeCvEntry>(e =>
        {
            e.HasOne(c => c.Employee).WithMany()
                .HasForeignKey(c => c.EmployeeId).OnDelete(DeleteBehavior.Cascade);

            e.Property(c => c.Title).HasMaxLength(200);
            e.Property(c => c.Organization).HasMaxLength(200);
            e.Property(c => c.Description).HasMaxLength(2000);

            e.HasIndex(c => new { c.TenantId, c.EmployeeId });
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        builder.Entity<Candidate>(e =>
        {
            // SetNull on both: a résumé deleted from the library, or an employee record removed
            // years later, must not take the application with it.
            e.HasOne(c => c.ResumeMediaAsset).WithMany()
                .HasForeignKey(c => c.ResumeMediaAssetId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(c => c.Employee).WithMany()
                .HasForeignKey(c => c.EmployeeId).OnDelete(DeleteBehavior.SetNull);

            // SetNull as well: deleting a posting after a season is housekeeping, and it must
            // not delete the applications it drew — they are the record of who applied here.
            e.HasOne(c => c.JobPosting).WithMany(j => j.Candidates)
                .HasForeignKey(c => c.JobPostingId).OnDelete(DeleteBehavior.SetNull);

            e.Property(c => c.FirstName).HasMaxLength(100);
            e.Property(c => c.LastName).HasMaxLength(100);
            e.Property(c => c.Email).HasMaxLength(256);
            e.Property(c => c.Phone).HasMaxLength(40);
            e.Property(c => c.DesiredJobTitle).HasMaxLength(150);
            e.Property(c => c.Source).HasMaxLength(150);
            e.Property(c => c.Notes).HasMaxLength(4000);
            e.Property(c => c.ApplicationSummary).HasMaxLength(8000);

            // One application per account per posting, enforced by the database rather than only
            // by the endpoint: a double-pressed button is the ordinary way this happens, and the
            // second row would read to the company as a second person. Filtered, so the rows
            // without an account -- a CV that arrived by email, somebody entered by hand -- are
            // not forced to be unique on anything.
            e.HasIndex(c => new { c.JobPostingId, c.ApplicantUserId })
                .IsUnique()
                .HasFilter("\"ApplicantUserId\" IS NOT NULL AND \"JobPostingId\" IS NOT NULL");

            // Declared on purpose, and it is not redundant with the one above. That one is a
            // partial index: it covers nothing for a candidate with no account, which is every
            // CV that arrived by email and everybody entered by hand. The query this serves --
            // how many people answered this posting -- runs on every load of the hiring screen
            // and would fall back to a table scan without it. Left implicit, the model generator
            // reads the composite as covering it and drops it.
            e.HasIndex(c => c.JobPostingId);

            e.HasIndex(c => new { c.TenantId, c.Status });
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        // ---- Suppliers, orders and what arrived ----

        builder.Entity<Supplier>(e =>
        {
            e.Property(s => s.Name).HasMaxLength(200);
            e.Property(s => s.ContactName).HasMaxLength(150);
            e.Property(s => s.Email).HasMaxLength(256);
            e.Property(s => s.Phone).HasMaxLength(40);
            e.Property(s => s.Website).HasMaxLength(300);
            e.Property(s => s.AccountNumber).HasMaxLength(100);
            e.Property(s => s.Line1).HasMaxLength(200);
            e.Property(s => s.City).HasMaxLength(100);
            e.Property(s => s.Province).HasMaxLength(60);
            e.Property(s => s.PostalCode).HasMaxLength(20);
            e.Property(s => s.Country).HasMaxLength(80);
            e.Property(s => s.AddressKey).HasMaxLength(260);

            // The platform-wide index behind supplier matching: when a company signs up, this is
            // the one query that has to find its records in every other tenant at once.
            e.HasIndex(s => s.AddressKey);

            // SetNull, not cascade: deleting the company that turned out to be this supplier must
            // not delete the supplier, nor the orders placed with it.
            e.HasOne(s => s.LinkedTenant).WithMany()
                .HasForeignKey(s => s.LinkedTenantId).OnDelete(DeleteBehavior.SetNull);
            e.Property(s => s.Notes).HasMaxLength(4000);

            e.HasIndex(s => new { s.TenantId, s.Name });
            e.HasQueryFilter(s => s.TenantId == CurrentTenantId);
        });

        builder.Entity<PurchaseOrder>(e =>
        {
            // Restrict: a supplier with orders against them cannot be deleted, because the
            // order is the record of money that left and it has to say where it went.
            e.HasOne(o => o.Supplier).WithMany(s => s.Orders)
                .HasForeignKey(o => o.SupplierId).OnDelete(DeleteBehavior.Restrict);

            e.HasOne(o => o.Project).WithMany()
                .HasForeignKey(o => o.ProjectId).OnDelete(DeleteBehavior.SetNull);

            e.Property(o => o.Reference).HasMaxLength(100);
            e.Property(o => o.Note).HasMaxLength(2000);

            // The supplier has this number written down too, so two orders must never share it.
            e.HasIndex(o => new { o.TenantId, o.Number }).IsUnique();
            e.HasIndex(o => new { o.TenantId, o.Status });
            e.HasQueryFilter(o => o.TenantId == CurrentTenantId);
        });

        builder.Entity<PurchaseOrderLine>(e =>
        {
            e.HasOne(l => l.PurchaseOrder).WithMany(o => o.Lines)
                .HasForeignKey(l => l.PurchaseOrderId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: a product taken out of the catalogue leaves the line it was ordered on
            // standing, with the description that was written when it was ordered.
            e.HasOne(l => l.Product).WithMany()
                .HasForeignKey(l => l.ProductId).OnDelete(DeleteBehavior.SetNull);

            e.Property(l => l.Description).HasMaxLength(500);
            e.Property(l => l.Unit).HasMaxLength(20);
            e.Property(l => l.Quantity).HasPrecision(14, 3);
            e.Property(l => l.UnitCost).HasPrecision(14, 2);

            e.HasQueryFilter(l => l.TenantId == CurrentTenantId);
        });

        builder.Entity<GoodsReceipt>(e =>
        {
            e.HasOne(r => r.PurchaseOrder).WithMany(o => o.Receipts)
                .HasForeignKey(r => r.PurchaseOrderId).OnDelete(DeleteBehavior.Cascade);

            e.Property(r => r.SlipNumber).HasMaxLength(100);
            e.Property(r => r.Note).HasMaxLength(1000);

            e.HasIndex(r => new { r.TenantId, r.ReceivedOn });
            e.HasQueryFilter(r => r.TenantId == CurrentTenantId);
        });

        builder.Entity<GoodsReceiptLine>(e =>
        {
            e.HasOne(l => l.GoodsReceipt).WithMany(r => r.Lines)
                .HasForeignKey(l => l.GoodsReceiptId).OnDelete(DeleteBehavior.Cascade);

            // Restrict: deleting an ordered line while a delivery still points at it would
            // leave a quantity received against nothing. The order has to drop the receipt first.
            e.HasOne(l => l.PurchaseOrderLine).WithMany(ol => ol.ReceiptLines)
                .HasForeignKey(l => l.PurchaseOrderLineId).OnDelete(DeleteBehavior.Restrict);

            e.Property(l => l.Quantity).HasPrecision(14, 3);

            e.HasQueryFilter(l => l.TenantId == CurrentTenantId);
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

        builder.Entity<Gallery>(e =>
        {
            e.Property(g => g.Name).HasMaxLength(120);
            e.Property(g => g.Description).HasMaxLength(500);

            // One list per company with no two sets of the same name: two galleries called
            // "Toitures" is two places to put a photograph and one of them forgotten.
            e.HasIndex(g => new { g.TenantId, g.Name }).IsUnique();
            e.HasIndex(g => new { g.TenantId, g.SortOrder });

            e.HasQueryFilter(g => g.TenantId == CurrentTenantId);
        });

        builder.Entity<GalleryImage>(e =>
        {
            e.HasOne(i => i.Gallery).WithMany(g => g.Images)
                .HasForeignKey(i => i.GalleryId).OnDelete(DeleteBehavior.Cascade);

            // Cascade, unlike a form answer that keeps the name of a file it lost: a photograph
            // that is gone is nothing to look at, and the row would be a hole in a grid.
            e.HasOne(i => i.MediaAsset).WithMany()
                .HasForeignKey(i => i.MediaAssetId).OnDelete(DeleteBehavior.Cascade);

            e.Property(i => i.Caption).HasMaxLength(300);

            e.HasIndex(i => new { i.GalleryId, i.SortOrder });
            e.HasQueryFilter(i => i.TenantId == CurrentTenantId);
        });

        builder.Entity<PublicPageSection>(e =>
        {
            // SetNull for both: losing a gallery or a photograph must not take the arrangement
            // with it. The page skips a section with nothing in it, and the builder shows the
            // owner an empty slot they can fill or remove.
            e.HasOne(s => s.Gallery).WithMany()
                .HasForeignKey(s => s.GalleryId).OnDelete(DeleteBehavior.SetNull);

            e.HasOne(s => s.MediaAsset).WithMany()
                .HasForeignKey(s => s.MediaAssetId).OnDelete(DeleteBehavior.SetNull);

            e.Property(s => s.Title).HasMaxLength(200);
            e.Property(s => s.Text).HasMaxLength(8000);

            // What the public page asks for on every visit: this company's bands, in order.
            e.HasIndex(s => new { s.TenantId, s.SortOrder });

            e.HasQueryFilter(s => s.TenantId == CurrentTenantId);
        });

        builder.Entity<CustomerOrder>(e =>
        {
            // Cascade: an order belongs to the customer it was placed by, and deleting a client
            // file takes their orders with it the way it takes their invoices.
            e.HasOne(o => o.Client).WithMany()
                .HasForeignKey(o => o.ClientId).OnDelete(DeleteBehavior.Cascade);

            // Restrict: the account that placed it is how the person finds it again from their
            // own space, and an order with no author is an order nobody can claim.
            e.HasOne(o => o.PlacedByUser).WithMany()
                .HasForeignKey(o => o.PlacedByUserId).OnDelete(DeleteBehavior.Restrict);

            // SetNull: deleting the invoice drawn from an order must not delete the order, which
            // is the record of what was actually asked for.
            e.HasOne(o => o.Invoice).WithMany()
                .HasForeignKey(o => o.InvoiceId).OnDelete(DeleteBehavior.SetNull);

            e.Property(o => o.ContactName).HasMaxLength(200);
            e.Property(o => o.ContactEmail).HasMaxLength(256);
            e.Property(o => o.ContactPhone).HasMaxLength(40);
            e.Property(o => o.Note).HasMaxLength(2000);
            e.Property(o => o.Currency).HasMaxLength(3);
            e.Property(o => o.GstRate).HasPrecision(6, 3);
            e.Property(o => o.QstRate).HasPrecision(6, 3);
            e.Property(o => o.AmountPaid).HasPrecision(14, 2);
            e.Property(o => o.StripeCheckoutSessionId).HasMaxLength(200);
            e.Property(o => o.StripePaymentReference).HasMaxLength(200);

            // One sequence per company, with nothing allowed to hand out the same number twice.
            e.HasIndex(o => new { o.TenantId, o.Number }).IsUnique();

            // What a person's own space asks for: their orders, newest first, across every
            // company at once -- so the tenant cannot be part of this one.
            e.HasIndex(o => new { o.PlacedByUserId, o.CreatedAt });

            e.HasQueryFilter(o => o.TenantId == CurrentTenantId
                && (CurrentClientId == null || o.ClientId == CurrentClientId));
        });

        builder.Entity<CustomerOrderLine>(e =>
        {
            e.HasOne(l => l.Order).WithMany(o => o.Lines)
                .HasForeignKey(l => l.OrderId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: tidying the catalogue must not rewrite what somebody ordered. The line
            // carries its own description and price, so it stays readable without the product.
            e.HasOne(l => l.Product).WithMany()
                .HasForeignKey(l => l.ProductId).OnDelete(DeleteBehavior.SetNull);

            e.Property(l => l.Description).HasMaxLength(500);
            e.Property(l => l.Unit).HasMaxLength(20);
            e.Property(l => l.Quantity).HasPrecision(14, 3);
            e.Property(l => l.UnitPrice).HasPrecision(14, 2);

            e.HasIndex(l => new { l.OrderId, l.SortOrder });
            e.HasQueryFilter(l => l.TenantId == CurrentTenantId);
        });

        builder.Entity<FormTemplate>(e =>
        {
            e.Property(f => f.Title).HasMaxLength(200);
            e.Property(f => f.Description).HasMaxLength(1000);
            e.Property(f => f.SuccessMessage).HasMaxLength(500);

            e.HasIndex(f => new { f.TenantId, f.SortOrder });

            // The public page asks for exactly this set, on every visit, for a company that has
            // one form among forty rows of drafts and checklists.
            e.HasIndex(f => new { f.TenantId, f.ShowOnPublicPage });
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

            // Restrict: a kind of asset still named by an action cannot be deleted out from
            // under it, which would leave the form creating vehicles of a type that is gone.
            // The types endpoint already refuses a type in use and says what is using it.
            e.HasOne(a => a.NewAssetType).WithMany()
                .HasForeignKey(a => a.NewAssetTypeId).OnDelete(DeleteBehavior.Restrict);

            e.Property(a => a.Recipients).HasMaxLength(500);
            e.Property(a => a.Subject).HasMaxLength(200);
            e.Property(a => a.NewAssetUsageUnit).HasMaxLength(20);

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

            // SetNull again, for the same reason: scrapping the car does not unsay the sheet
            // that filed it. Note that deleting the client cascades the asset away, and this
            // submission then keeps neither — which is correct, and why the answers themselves
            // carry their own copies of everything that was said.
            e.HasOne(s => s.CreatedClientAsset).WithMany()
                .HasForeignKey(s => s.CreatedClientAssetId).OnDelete(DeleteBehavior.SetNull);

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

            // SetNull again: deleting the file from the library must not delete the answer.
            // It keeps the file's name as its text, so the submission still says what was sent.
            e.HasOne(a => a.MediaAsset).WithMany()
                .HasForeignKey(a => a.MediaAssetId).OnDelete(DeleteBehavior.SetNull);

            e.Property(a => a.Label).HasMaxLength(300);
            e.Property(a => a.Value).HasMaxLength(4000);

            e.HasIndex(a => new { a.SubmissionId, a.SortOrder });
            e.HasQueryFilter(a => a.TenantId == CurrentTenantId);
        });

        builder.Entity<ProjectExpense>(e =>
        {
            e.HasOne(x => x.Project).WithMany(p => p.Expenses)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: removing a task from the plan must not take the hours or the money
            // spent while it existed. The line stays on the job, attached to nothing.
            e.HasOne(x => x.ProjectTask).WithMany()
                .HasForeignKey(x => x.ProjectTaskId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.ProjectTaskId);

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

        builder.Entity<ProjectExtraCharge>(e =>
        {
            e.HasOne(x => x.Project).WithMany(p => p.ExtraCharges)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: removing a task from the plan must not take the hours or the money
            // spent while it existed. The line stays on the job, attached to nothing.
            e.HasOne(x => x.ProjectTask).WithMany()
                .HasForeignKey(x => x.ProjectTaskId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.ProjectTaskId);

            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Cost).HasPrecision(14, 2);
            e.Property(x => x.SellingPrice).HasPrecision(14, 2);

            e.HasIndex(x => new { x.ProjectId, x.CreatedAt });

            // The same filter an expense carries, and for the same reason: a customer reads
            // their own project, so the rows follow the project's client as well as the tenant.
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId
                && (CurrentClientId == null || x.Project!.ClientId == CurrentClientId));
        });

        builder.Entity<ProjectMaterial>(e =>
        {
            e.HasOne(m => m.Project).WithMany(p => p.Materials)
                .HasForeignKey(m => m.ProjectId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: removing a task from the plan must not take the hours or the money
            // spent while it existed. The line stays on the job, attached to nothing.
            e.HasOne(x => x.ProjectTask).WithMany()
                .HasForeignKey(x => x.ProjectTaskId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.ProjectTaskId);

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

            // SetNull: removing a task from the plan must not take the hours or the money
            // spent while it existed. The line stays on the job, attached to nothing.
            e.HasOne(x => x.ProjectTask).WithMany()
                .HasForeignKey(x => x.ProjectTaskId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.ProjectTaskId);

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

        builder.Entity<PricePolicyTier>(e =>
        {
            // Cascade: a band is part of its policy and means nothing without it. Deleting the
            // policy is already refused while a project or an invoice names it, so this cannot
            // take bands out from under something that still prices from them.
            e.HasOne(t => t.PricePolicy).WithMany(p => p.Tiers)
                .HasForeignKey(t => t.PricePolicyId).OnDelete(DeleteBehavior.Cascade);

            e.Property(t => t.FromAmount).HasPrecision(14, 2);
            e.Property(t => t.ToAmount).HasPrecision(14, 2);
            e.Property(t => t.MarginPercent).HasPrecision(6, 3);

            e.HasIndex(t => new { t.PricePolicyId, t.FromAmount });
            e.HasQueryFilter(t => t.TenantId == CurrentTenantId);
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

        builder.Entity<ProjectCategory>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(100);
            e.HasIndex(c => new { c.TenantId, c.Name }).IsUnique();
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        builder.Entity<ProjectSubCategory>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(100);

            // Cascade: a sub-category has no meaning without its category, and the jobs filed
            // under it keep their own category.
            e.HasOne(c => c.Category).WithMany(c => c.SubCategories)
                .HasForeignKey(c => c.CategoryId).OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(c => new { c.CategoryId, c.Name }).IsUnique();
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        builder.Entity<WageClassification>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(100);
            e.HasIndex(c => new { c.TenantId, c.Name }).IsUnique();
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        builder.Entity<Quote>(e =>
        {
            e.HasIndex(q => new { q.TenantId, q.Number }).IsUnique();
            e.Property(q => q.PoNumber).HasMaxLength(100);
            e.Property(q => q.Description).HasMaxLength(4000);
            e.Property(q => q.ClientRespondedBy).HasMaxLength(200);
            e.Property(q => q.ClientResponseNote).HasMaxLength(2000);

            // Restrict on the client, like a project: a client with quotes on file is not
            // deleted out from under them.
            e.HasOne(q => q.Client).WithMany().HasForeignKey(q => q.ClientId).OnDelete(DeleteBehavior.Restrict);

            // SetNull everywhere else: tidying an address book, an asset list or the filing
            // categories must never take a quote with it.
            e.HasOne(q => q.ClientAsset).WithMany().HasForeignKey(q => q.ClientAssetId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(q => q.ClientAddress).WithMany().HasForeignKey(q => q.ClientAddressId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(q => q.SiteAddress).WithMany().HasForeignKey(q => q.SiteAddressId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(q => q.Category).WithMany().HasForeignKey(q => q.CategoryId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(q => q.SubCategory).WithMany().HasForeignKey(q => q.SubCategoryId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(q => q.WageClassification).WithMany().HasForeignKey(q => q.WageClassificationId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(q => q.Project).WithMany().HasForeignKey(q => q.ProjectId).OnDelete(DeleteBehavior.SetNull);

            e.HasQueryFilter(q => q.TenantId == CurrentTenantId
                && (CurrentClientId == null || q.ClientId == CurrentClientId));
        });

        builder.Entity<QuoteDocument>(e =>
        {
            e.Property(d => d.Title).HasMaxLength(200);
            e.Property(d => d.Category).HasMaxLength(100);
            e.HasOne(d => d.Quote).WithMany(q => q.Documents).HasForeignKey(d => d.QuoteId).OnDelete(DeleteBehavior.Cascade);
            // Cascade, like a project's documents: removing the file from the library removes the
            // rows that pointed at it, rather than leaving a document with nothing to open.
            e.HasOne(d => d.MediaAsset).WithMany().HasForeignKey(d => d.MediaAssetId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(d => new { d.QuoteId, d.CreatedAt });
            e.HasQueryFilter(d => d.TenantId == CurrentTenantId
                && (CurrentClientId == null || d.Quote!.ClientId == CurrentClientId));
        });

        builder.Entity<QuoteNote>(e =>
        {
            e.Property(n => n.Body).HasMaxLength(4000);
            e.HasOne(n => n.Quote).WithMany(q => q.Notes).HasForeignKey(n => n.QuoteId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(n => new { n.QuoteId, n.CreatedAt });
            e.HasQueryFilter(n => n.TenantId == CurrentTenantId
                && (CurrentClientId == null || n.Quote!.ClientId == CurrentClientId));
        });

        builder.Entity<QuoteLine>(e =>
        {
            e.Property(l => l.Code).HasMaxLength(100);
            e.Property(l => l.Description).HasMaxLength(2000);
            e.Property(l => l.Unit).HasMaxLength(50);
            e.Property(l => l.Quantity).HasPrecision(14, 3);
            e.Property(l => l.UnitCost).HasPrecision(14, 2);
            e.Property(l => l.UnitPrice).HasPrecision(14, 2);

            e.HasOne(l => l.Quote).WithMany(q => q.Lines).HasForeignKey(l => l.QuoteId).OnDelete(DeleteBehavior.Cascade);
            // SetNull: retiring a product from the catalogue must not change a price already given.
            e.HasOne(l => l.Product).WithMany().HasForeignKey(l => l.ProductId).OnDelete(DeleteBehavior.SetNull);

            e.HasIndex(l => new { l.QuoteId, l.Kind, l.SortOrder });
            e.HasQueryFilter(l => l.TenantId == CurrentTenantId
                && (CurrentClientId == null || l.Quote!.ClientId == CurrentClientId));
        });

        builder.Entity<WageClassificationStep>(e =>
        {
            e.Property(s => s.Name).HasMaxLength(100);
            e.Property(s => s.Wage).HasPrecision(10, 2);
            e.Property(s => s.Cost).HasPrecision(10, 2);
            e.Property(s => s.Selling).HasPrecision(10, 2);

            // Cascade: a step is a row of its classification's table and nothing else.
            e.HasOne(s => s.Classification).WithMany(c => c.Steps)
                .HasForeignKey(s => s.ClassificationId).OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(s => new { s.ClassificationId, s.SortOrder });
            e.HasQueryFilter(s => s.TenantId == CurrentTenantId);
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
            e.Property(j => j.Notes).HasMaxLength(4000);
            e.HasIndex(j => new { j.TenantId, j.CreatedAt });
            e.HasIndex(j => new { j.TenantId, j.Status });

            // SetNull, not cascade: deleting a form must not delete the positions that were
            // advertised with it. The posting stays up and simply stops asking questions.
            e.HasOne(j => j.FormTemplate).WithMany()
                .HasForeignKey(j => j.FormTemplateId).OnDelete(DeleteBehavior.SetNull);

            // No query filter, for the same reason as the page it appears on. Every staff query
            // scopes by tenant explicitly.
        });

        builder.Entity<JobPostingDocument>(e =>
        {
            e.Property(d => d.Label).HasMaxLength(200);

            // Cascade from the posting: a file hung on a position that no longer exists is not
            // a file anybody will ever open again.
            e.HasOne(d => d.JobPosting).WithMany(j => j.Documents)
                .HasForeignKey(d => d.JobPostingId).OnDelete(DeleteBehavior.Cascade);

            // Cascade from the asset too: the row points at bytes, and a row pointing at bytes
            // that are gone is a broken link on a public page.
            e.HasOne(d => d.MediaAsset).WithMany()
                .HasForeignKey(d => d.MediaAssetId).OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(d => new { d.JobPostingId, d.SortOrder });

            // No query filter, to match the posting it belongs to.
        });

        builder.Entity<PersonalProfile>(e =>
        {
            e.HasKey(p => p.UserId);

            // Cascade from the account: a CV is the person's, and it goes when the account does.
            e.HasOne(p => p.User).WithOne()
                .HasForeignKey<PersonalProfile>(p => p.UserId).OnDelete(DeleteBehavior.Cascade);

            // SetNull: the uploaded document can be deleted from the library without taking the
            // rest of the CV with it.
            e.HasOne(p => p.ResumeMediaAsset).WithMany()
                .HasForeignKey(p => p.ResumeMediaAssetId).OnDelete(DeleteBehavior.SetNull);

            e.Property(p => p.Phone).HasMaxLength(40);
            e.Property(p => p.Headline).HasMaxLength(200);
            e.Property(p => p.Summary).HasMaxLength(4000);
            e.Property(p => p.City).HasMaxLength(100);
            e.Property(p => p.Province).HasMaxLength(80);
            e.Property(p => p.Country).HasMaxLength(80);
            e.Property(p => p.Skills).HasMaxLength(2000);
            e.Property(p => p.SpokenLanguages).HasMaxLength(500);
            e.Property(p => p.WrittenLanguages).HasMaxLength(500);

            // No query filter: there is no tenant on this row. See PersonalProfile.
        });

        builder.Entity<PersonalExperience>(e =>
        {
            e.HasOne(x => x.Profile).WithMany(p => p.Experiences)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Employer).HasMaxLength(200);
            e.Property(x => x.Location).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(2000);

            e.HasIndex(x => new { x.UserId, x.SortOrder });
        });

        builder.Entity<PersonalEducation>(e =>
        {
            e.HasOne(x => x.Profile).WithMany(p => p.Education)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

            e.Property(x => x.Program).HasMaxLength(200);
            e.Property(x => x.School).HasMaxLength(200);
            e.Property(x => x.Notes).HasMaxLength(1000);

            e.HasIndex(x => new { x.UserId, x.SortOrder });
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
            e.Property(b => b.CreditPrefix).HasMaxLength(10);
            e.Property(b => b.Currency).HasMaxLength(3);
            e.Property(b => b.InvoiceEmailSubject).HasMaxLength(300);
            e.Property(b => b.InvoiceEmailBody).HasMaxLength(8000);
            e.Property(b => b.QuoteEmailSubject).HasMaxLength(300);
            e.Property(b => b.QuoteEmailBody).HasMaxLength(8000);
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
            e.Property(t => t.BusinessNumber).HasMaxLength(40);

            // acct_ plus 16 characters today, with room for Stripe to grow it.
            e.Property(t => t.StripeAccountId).HasMaxLength(64);
            // Not unique by a constraint: a connected account forgotten by RefreshAsync and
            // reopened would otherwise collide with its own abandoned row if one ever survived
            // elsewhere. Looked up often enough to earn the index.
            e.HasIndex(t => t.StripeAccountId);
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
