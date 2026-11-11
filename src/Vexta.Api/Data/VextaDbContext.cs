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

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Tenant>(e =>
        {
            e.HasIndex(t => t.Slug).IsUnique();
        });

        builder.Entity<ApplicationUser>(e =>
        {
            e.HasOne(u => u.Tenant).WithMany(t => t.Users).HasForeignKey(u => u.TenantId).OnDelete(DeleteBehavior.Cascade);
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
    }
}
