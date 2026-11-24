using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStripeConnectAndInvoicePayLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StripeAccountCheckedAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeAccountId",
                table: "Tenants",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "StripeChargesEnabled",
                table: "Tenants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "StripeDetailsSubmitted",
                table: "Tenants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "StripePayoutsEnabled",
                table: "Tenants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PayToken",
                table: "Invoices",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_StripeAccountId",
                table: "Tenants",
                column: "StripeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_PayToken",
                table: "Invoices",
                column: "PayToken",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tenants_StripeAccountId",
                table: "Tenants");

            migrationBuilder.DropIndex(
                name: "IX_Invoices_PayToken",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "StripeAccountCheckedAt",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "StripeAccountId",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "StripeChargesEnabled",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "StripeDetailsSubmitted",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "StripePayoutsEnabled",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "PayToken",
                table: "Invoices");
        }
    }
}
