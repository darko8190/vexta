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
            e.HasQueryFilter(c => c.TenantId == CurrentTenantId);
        });

        builder.Entity<Address>(e =>
        {
            e.HasOne(a => a.Client).WithMany(c => c.Addresses).HasForeignKey(a => a.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(a => a.TenantId == CurrentTenantId);
        });

        builder.Entity<Project>(e =>
        {
            e.HasOne(p => p.Client).WithMany(c => c.Projects).HasForeignKey(p => p.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.Property(p => p.Budget).HasPrecision(14, 2);
            e.HasQueryFilter(p => p.TenantId == CurrentTenantId);
        });

        builder.Entity<Invoice>(e =>
        {
            e.HasOne(i => i.Client).WithMany(c => c.Invoices).HasForeignKey(i => i.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.Project).WithMany(p => p.Invoices).HasForeignKey(i => i.ProjectId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(i => new { i.TenantId, i.Number }).IsUnique();
            e.HasQueryFilter(i => i.TenantId == CurrentTenantId);
        });

        builder.Entity<InvoiceLine>(e =>
        {
            e.HasOne(l => l.Invoice).WithMany(i => i.Lines).HasForeignKey(l => l.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            e.Property(l => l.Quantity).HasPrecision(14, 3);
            e.Property(l => l.UnitPrice).HasPrecision(14, 2);
            e.Property(l => l.TaxRatePercent).HasPrecision(6, 3);
            e.HasQueryFilter(l => l.Invoice!.TenantId == CurrentTenantId);
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
