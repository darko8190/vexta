using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBillingConfiguredAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ConfiguredAt",
                table: "BillingSettings",
                type: "timestamp with time zone",
                nullable: true);

            // Every company that already had a billing row had been through the form: the row
            // existing is exactly what used to unlock invoicing. Without this they would all be
            // told to settle their billing again, and their invoice endpoints would refuse.
            migrationBuilder.Sql(
                @"UPDATE ""BillingSettings"" SET ""ConfiguredAt"" = ""UpdatedAt"" WHERE ""ConfiguredAt"" IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConfiguredAt",
                table: "BillingSettings");
        }
    }
}
