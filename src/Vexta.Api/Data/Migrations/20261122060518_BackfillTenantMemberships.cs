using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <summary>
    /// Gives every account that predates memberships the one it should have had.
    ///
    /// Seats are counted by membership now, and until today a membership was only created the
    /// first time someone opened their space switcher. Without this, every company's seat usage
    /// reads zero the moment this ships, and its limit stops meaning anything.
    /// </summary>
    public partial class BackfillTenantMemberships : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // NOT EXISTS rather than ON CONFLICT: the unique index is on (UserId, TenantId), and
            // spelling the condition out keeps this re-runnable and readable.
            migrationBuilder.Sql(@"
                INSERT INTO ""TenantMemberships"" (""Id"", ""UserId"", ""TenantId"", ""Role"", ""ClientId"", ""CreatedAt"")
                SELECT gen_random_uuid(), u.""Id"", u.""TenantId"", u.""Role"", NULL, now()
                  FROM ""AspNetUsers"" u
                 WHERE u.""TenantId"" IS NOT NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM ""TenantMemberships"" m
                        WHERE m.""UserId"" = u.""Id"" AND m.""TenantId"" = u.""TenantId"");
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Deliberately empty. The rows this adds are indistinguishable from the ones created
            // normally, so removing them would take real memberships with them.
        }
    }
}
