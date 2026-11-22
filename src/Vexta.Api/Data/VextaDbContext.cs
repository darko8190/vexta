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

            e.HasQueryFilter(c => c.TenantId == CurrentTenantId
                && (CurrentClientId == null || c.Id == CurrentClientId));
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
            e.HasQueryFilter(p => p.TenantId == CurrentTenantId
                && (CurrentClientId == null || p.ClientId == CurrentClientId));
        });

        builder.Entity<Invoice>(e =>
        {
            e.HasOne(i => i.Client).WithMany(c => c.Invoices).HasForeignKey(i => i.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.Project).WithMany(p => p.Invoices).HasForeignKey(i => i.ProjectId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(i => new { i.TenantId, i.Number }).IsUnique();
            e.HasQueryFilter(i => i.TenantId == CurrentTenantId
                && (CurrentClientId == null || i.ClientId == CurrentClientId));
        });

        builder.Entity<InvoiceLine>(e =>
        {
            e.HasOne(l => l.Invoice).WithMany(i => i.Lines).HasForeignKey(l => l.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            e.Property(l => l.Quantity).HasPrecision(14, 3);
            e.Property(l => l.UnitPrice).HasPrecision(14, 2);
            e.Property(l => l.TaxRatePercent).HasPrecision(6, 3);
            e.HasQueryFilter(l => l.Invoice!.TenantId == CurrentTenantId
                && (CurrentClientId == null || l.Invoice!.ClientId == CurrentClientId));
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
