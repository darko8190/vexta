using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <summary>
    /// Puts the person who opened each company into its own staff list.
    ///
    /// New companies get this row at sign-up, but every company created before today has an
    /// owner who is absent from Ressources humaines and cannot be put on a team — the one name
    /// everybody looks for first. Two steps, because the address may already be on file: an
    /// owner who added themselves by hand is linked to their account rather than duplicated,
    /// which the unique index on (TenantId, Email) would refuse anyway.
    ///
    /// Role 1 is TenantAdmin and Kind 0 is a business space. Personal spaces have no staff.
    /// </summary>
    public partial class BackfillOwnerEmployees : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Employees" e
                SET "UserId" = u."Id", "UpdatedAt" = now()
                FROM "AspNetUsers" u
                WHERE e."UserId" IS NULL
                  AND u."Role" = 1
                  AND u."TenantId" = e."TenantId"
                  AND lower(u."Email") = lower(e."Email");
                """);

            migrationBuilder.Sql("""
                INSERT INTO "Employees" ("Id", "TenantId", "FirstName", "LastName", "Email",
                                         "UserId", "CreatedAt", "UpdatedAt")
                SELECT gen_random_uuid(), u."TenantId", u."FirstName", u."LastName",
                       lower(u."Email"), u."Id", now(), now()
                FROM "AspNetUsers" u
                JOIN "Tenants" t ON t."Id" = u."TenantId"
                WHERE u."Role" = 1
                  AND t."Kind" = 0
                  AND u."Email" IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM "Employees" e
                      WHERE e."TenantId" = u."TenantId"
                        AND (e."UserId" = u."Id" OR lower(e."Email") = lower(u."Email"))
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Deliberately empty. Deleting these rows again would take whatever has since been
            // hung off them — a team membership, a document — and there is no way to tell a
            // row this migration created from one someone typed in afterwards.
        }
    }
}
