using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddQuoteRevisionsAndDirectInvoice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Quotes_TenantId_Number",
                table: "Quotes");

            migrationBuilder.AddColumn<Guid>(
                name: "InvoiceId",
                table: "Quotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReplacesId",
                table: "Quotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Revision",
                table: "Quotes",
                type: "integer",
                nullable: false,
                // Every quote that exists is its own first version.
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_InvoiceId",
                table: "Quotes",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_ReplacesId",
                table: "Quotes",
                column: "ReplacesId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_TenantId_Number_Revision",
                table: "Quotes",
                columns: new[] { "TenantId", "Number", "Revision" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Quotes_Invoices_InvoiceId",
                table: "Quotes",
                column: "InvoiceId",
                principalTable: "Invoices",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Quotes_Quotes_ReplacesId",
                table: "Quotes",
                column: "ReplacesId",
                principalTable: "Quotes",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Quotes_Invoices_InvoiceId",
                table: "Quotes");

            migrationBuilder.DropForeignKey(
                name: "FK_Quotes_Quotes_ReplacesId",
                table: "Quotes");

            migrationBuilder.DropIndex(
                name: "IX_Quotes_InvoiceId",
                table: "Quotes");

            migrationBuilder.DropIndex(
                name: "IX_Quotes_ReplacesId",
                table: "Quotes");

            migrationBuilder.DropIndex(
                name: "IX_Quotes_TenantId_Number_Revision",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "InvoiceId",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "ReplacesId",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "Revision",
                table: "Quotes");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_TenantId_Number",
                table: "Quotes",
                columns: new[] { "TenantId", "Number" },
                unique: true);
        }
    }
}
