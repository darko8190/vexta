using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoiceCredits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CreditPrefix",
                table: "BillingSettings",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                // Existing companies start where a new one does, at NC-0001. EF's own default
                // here would be an empty prefix and a counter at zero: "-0000".
                defaultValue: "NC");

            migrationBuilder.AddColumn<int>(
                name: "NextCreditNumber",
                table: "BillingSettings",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "InvoiceCredits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Subtotal = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    Gst = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    Qst = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    Reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceCredits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoiceCredits_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceCredits_InvoiceId_Date",
                table: "InvoiceCredits",
                columns: new[] { "InvoiceId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceCredits_TenantId_Number",
                table: "InvoiceCredits",
                columns: new[] { "TenantId", "Number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvoiceCredits");

            migrationBuilder.DropColumn(
                name: "CreditPrefix",
                table: "BillingSettings");

            migrationBuilder.DropColumn(
                name: "NextCreditNumber",
                table: "BillingSettings");
        }
    }
}
