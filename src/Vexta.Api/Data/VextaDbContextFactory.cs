using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Vexta.Api.Data;

public class VextaDbContextFactory : IDesignTimeDbContextFactory<VextaDbContext>
{
    public VextaDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<VextaDbContext>();
        optionsBuilder.UseNpgsql("Host=localhost;Database=vextadb;Username=postgres;Password=postgres");
        return new VextaDbContext(optionsBuilder.Options, new HttpContextAccessor());
    }
}
