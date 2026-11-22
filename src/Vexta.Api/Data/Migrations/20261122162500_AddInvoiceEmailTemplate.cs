using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoiceEmailTemplate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "InvoiceEmailBody",
                table: "BillingSettings",
                type: "character varying(8000)",
                maxLength: 8000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceEmailSubject",
                table: "BillingSettings",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InvoiceEmailBody",
                table: "BillingSettings");

            migrationBuilder.DropColumn(
                name: "InvoiceEmailSubject",
                table: "BillingSettings");
        }
    }
}
