using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectNumberAndAddresses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ClientAddressId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Number",
                table: "Projects",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "PoNumber",
                table: "Projects",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SameAddressAsClient",
                table: "Projects",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "SiteAddressId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            // Numbered before the unique index goes on, not after: every existing project got the
            // same default of 0, so the index would be rejected outright by any tenant holding
            // two of them. Ordered by creation so the numbers read as the history they are.
            //
            // SameAddressAsClient is set true for everything that already exists: none of them
            // has a separate site address, and false would claim the site is somewhere else and
            // then have nowhere to say where.
            migrationBuilder.Sql(@"
                WITH numbered AS (
                    SELECT ""Id"", ROW_NUMBER() OVER (PARTITION BY ""TenantId"" ORDER BY ""CreatedAt"", ""Id"") AS rn
                      FROM ""Projects""
                )
                UPDATE ""Projects"" p SET ""Number"" = n.rn FROM numbered n WHERE p.""Id"" = n.""Id"";

                UPDATE ""Projects"" SET ""SameAddressAsClient"" = TRUE;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_ClientAddressId",
                table: "Projects",
                column: "ClientAddressId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_SiteAddressId",
                table: "Projects",
                column: "SiteAddressId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_TenantId_Number",
                table: "Projects",
                columns: new[] { "TenantId", "Number" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_Addresses_ClientAddressId",
                table: "Projects",
                column: "ClientAddressId",
                principalTable: "Addresses",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_Addresses_SiteAddressId",
                table: "Projects",
                column: "SiteAddressId",
                principalTable: "Addresses",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Projects_Addresses_ClientAddressId",
                table: "Projects");

            migrationBuilder.DropForeignKey(
                name: "FK_Projects_Addresses_SiteAddressId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_Projects_ClientAddressId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_Projects_SiteAddressId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_Projects_TenantId_Number",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ClientAddressId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "Number",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "PoNumber",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "SameAddressAsClient",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "SiteAddressId",
                table: "Projects");
        }
    }
}
