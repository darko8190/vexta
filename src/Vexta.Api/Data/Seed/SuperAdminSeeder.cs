using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Vexta.Api.Domain;

namespace Vexta.Api.Data.Seed;

public static class SuperAdminSeeder
{
    public static async Task SeedAsync(IServiceProvider services, ILogger logger)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VextaDbContext>();
        await db.Database.MigrateAsync();

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();

        var email = configuration["SuperAdmin:Email"];
        var password = configuration["SuperAdmin:Password"];

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning(
                "SuperAdmin:Email / SuperAdmin:Password non définis — aucun super admin n'a été créé. " +
                "Définissez les variables d'environnement SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD puis redémarrez.");
            return;
        }

        var existing = await userManager.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Role == UserRole.SuperAdmin);
        if (existing is not null)
        {
            return;
        }

        var superAdmin = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            FirstName = "Super",
            LastName = "Admin",
            Role = UserRole.SuperAdmin,
            TenantId = null
        };

        var result = await userManager.CreateAsync(superAdmin, password);
        if (result.Succeeded)
        {
            logger.LogInformation("Super admin créé: {Email}", email);
        }
        else
        {
            logger.LogError("Échec de la création du super admin: {Errors}", string.Join(" ", result.Errors.Select(e => e.Description)));
        }
    }
}
