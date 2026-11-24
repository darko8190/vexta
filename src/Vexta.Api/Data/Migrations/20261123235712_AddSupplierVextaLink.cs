using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSupplierVextaLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AddressKey",
                table: "Suppliers",
                type: "character varying(260)",
                maxLength: 260,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "InvitationSentAt",
                table: "Suppliers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LinkedAt",
                table: "Suppliers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LinkedTenantId",
                table: "Suppliers",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Suppliers_AddressKey",
                table: "Suppliers",
                column: "AddressKey");

            migrationBuilder.CreateIndex(
                name: "IX_Suppliers_LinkedTenantId",
                table: "Suppliers",
                column: "LinkedTenantId");

            // The key for the suppliers that already exist, so a company signing up tomorrow is
            // recognised in the lists that were written before this column did. Without it the
            // feature would only ever see suppliers added from today on, and the lists that
            // matter most -- the ones built up over a year -- would match nothing.
            //
            // This has to produce exactly what CompanyIdentity.AddressKey produces in C#:
            // lowercased, accents removed, everything but letters and digits dropped, the postal
            // code and the street line joined by a bar. Suppliers missing either part are left
            // null, which is what the C# does too.
            migrationBuilder.Sql(
                """
                UPDATE "Suppliers"
                SET "AddressKey" =
                    regexp_replace(
                        translate(lower("PostalCode"), 'àâäçéèêëîïôöùûüÿ', 'aaaceeeeiioouuuy'),
                        '[^a-z0-9]', '', 'g')
                    || '|' ||
                    regexp_replace(
                        translate(lower("Line1"), 'àâäçéèêëîïôöùûüÿ', 'aaaceeeeiioouuuy'),
                        '[^a-z0-9]', '', 'g')
                WHERE "Line1" IS NOT NULL
                  AND "PostalCode" IS NOT NULL
                  AND regexp_replace(translate(lower("Line1"), 'àâäçéèêëîïôöùûüÿ', 'aaaceeeeiioouuuy'), '[^a-z0-9]', '', 'g') <> ''
                  AND regexp_replace(translate(lower("PostalCode"), 'àâäçéèêëîïôöùûüÿ', 'aaaceeeeiioouuuy'), '[^a-z0-9]', '', 'g') <> '';
                """);

            migrationBuilder.AddForeignKey(
                name: "FK_Suppliers_Tenants_LinkedTenantId",
                table: "Suppliers",
                column: "LinkedTenantId",
                principalTable: "Tenants",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Suppliers_Tenants_LinkedTenantId",
                table: "Suppliers");

            migrationBuilder.DropIndex(
                name: "IX_Suppliers_AddressKey",
                table: "Suppliers");

            migrationBuilder.DropIndex(
                name: "IX_Suppliers_LinkedTenantId",
                table: "Suppliers");

            migrationBuilder.DropColumn(
                name: "AddressKey",
                table: "Suppliers");

            migrationBuilder.DropColumn(
                name: "InvitationSentAt",
                table: "Suppliers");

            migrationBuilder.DropColumn(
                name: "LinkedAt",
                table: "Suppliers");

            migrationBuilder.DropColumn(
                name: "LinkedTenantId",
                table: "Suppliers");
        }
    }
}
