using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddQuoteOptionsDepositTemplatesTerms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DepositInvoiceId",
                table: "Quotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DepositPercent",
                table: "Quotes",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsOptional",
                table: "QuoteLines",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsSelected",
                table: "QuoteLines",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "QuoteTerms",
                table: "BillingSettings",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "QuoteTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    DepositPercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuoteTemplates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QuoteTemplateLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    Code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Unit = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: true),
                    UnitPrice = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    IsOptional = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuoteTemplateLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QuoteTemplateLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_QuoteTemplateLines_QuoteTemplates_TemplateId",
                        column: x => x.TemplateId,
                        principalTable: "QuoteTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_DepositInvoiceId",
                table: "Quotes",
                column: "DepositInvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_QuoteTemplateLines_ProductId",
                table: "QuoteTemplateLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_QuoteTemplateLines_TemplateId_Kind_SortOrder",
                table: "QuoteTemplateLines",
                columns: new[] { "TemplateId", "Kind", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_QuoteTemplates_TenantId_Name",
                table: "QuoteTemplates",
                columns: new[] { "TenantId", "Name" });

            migrationBuilder.AddForeignKey(
                name: "FK_Quotes_Invoices_DepositInvoiceId",
                table: "Quotes",
                column: "DepositInvoiceId",
                principalTable: "Invoices",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Quotes_Invoices_DepositInvoiceId",
                table: "Quotes");

            migrationBuilder.DropTable(
                name: "QuoteTemplateLines");

            migrationBuilder.DropTable(
                name: "QuoteTemplates");

            migrationBuilder.DropIndex(
                name: "IX_Quotes_DepositInvoiceId",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "DepositInvoiceId",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "DepositPercent",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "IsOptional",
                table: "QuoteLines");

            migrationBuilder.DropColumn(
                name: "IsSelected",
                table: "QuoteLines");

            migrationBuilder.DropColumn(
                name: "QuoteTerms",
                table: "BillingSettings");
        }
    }
}
