using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Vexta.Api.Data;

/// <summary>
/// How <c>dotnet ef</c> builds the model outside the running application, which has its
/// connection string handed to it by Aspire.
///
/// The fallback is a throwaway local database, and that is all <c>migrations add</c> needs — it
/// reads the model, never the server. <c>database update</c> does connect, which is why the
/// environment variable comes first: a hard-coded string here means every update lands on the
/// scratch database while the real one stays behind, silently, with the command reporting
/// success. The variable is the same one the container is given, so
/// <c>ConnectionStrings__vextadb=… dotnet ef database update</c> reaches the intended server.
/// </summary>
public class VextaDbContextFactory : IDesignTimeDbContextFactory<VextaDbContext>
{
    public VextaDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__vextadb")
            ?? "Host=localhost;Database=vextadb;Username=postgres;Password=postgres";

        var optionsBuilder = new DbContextOptionsBuilder<VextaDbContext>();
        optionsBuilder.UseNpgsql(connectionString);
        return new VextaDbContext(optionsBuilder.Options, new HttpContextAccessor());
    }
}
