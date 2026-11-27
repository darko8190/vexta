using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class QuoteContactsResponsesTemplatesAutoFees : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AssemblyId",
                table: "QuoteTemplateLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "EquipmentId",
                table: "QuoteTemplateLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BillingContactId",
                table: "Quotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ChangeRequestNote",
                table: "Quotes",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ChangeRequestedAt",
                table: "Quotes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ContactId",
                table: "Quotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResponseToken",
                table: "Quotes",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AssemblyId",
                table: "QuoteLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "EquipmentId",
                table: "QuoteLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentLineId",
                table: "QuoteLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProjectAssemblyId",
                table: "ProjectMaterials",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByUserId",
                table: "ProjectExpenses",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "QuoteEmailCanApprove",
                table: "BillingSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "QuoteEmailCanRefuse",
                table: "BillingSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "QuoteEmailCanRequestChange",
                table: "BillingSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "InvoiceAutoFees",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    IsTaxable = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceAutoFees", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProjectTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubCategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectTemplates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProjectTemplateLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    EquipmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: true),
                    Code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Unit = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: true),
                    UnitPrice = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectTemplateLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectTemplateLines_ProjectTemplates_TemplateId",
                        column: x => x.TemplateId,
                        principalTable: "ProjectTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_BillingContactId",
                table: "Quotes",
                column: "BillingContactId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_ContactId",
                table: "Quotes",
                column: "ContactId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_ResponseToken",
                table: "Quotes",
                column: "ResponseToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QuoteLines_AssemblyId",
                table: "QuoteLines",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_QuoteLines_EquipmentId",
                table: "QuoteLines",
                column: "EquipmentId");

            migrationBuilder.CreateIndex(
                name: "IX_QuoteLines_ParentLineId",
                table: "QuoteLines",
                column: "ParentLineId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMaterials_ProjectAssemblyId",
                table: "ProjectMaterials",
                column: "ProjectAssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceAutoFees_TenantId_SortOrder",
                table: "InvoiceAutoFees",
                columns: new[] { "TenantId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectTemplateLines_TemplateId_Kind_SortOrder",
                table: "ProjectTemplateLines",
                columns: new[] { "TemplateId", "Kind", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectTemplates_TenantId_Name",
                table: "ProjectTemplates",
                columns: new[] { "TenantId", "Name" });

            migrationBuilder.AddForeignKey(
                name: "FK_ProjectMaterials_ProjectAssemblies_ProjectAssemblyId",
                table: "ProjectMaterials",
                column: "ProjectAssemblyId",
                principalTable: "ProjectAssemblies",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_QuoteLines_Assemblies_AssemblyId",
                table: "QuoteLines",
                column: "AssemblyId",
                principalTable: "Assemblies",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_QuoteLines_Equipment_EquipmentId",
                table: "QuoteLines",
                column: "EquipmentId",
                principalTable: "Equipment",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_QuoteLines_QuoteLines_ParentLineId",
                table: "QuoteLines",
                column: "ParentLineId",
                principalTable: "QuoteLines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Quotes_ClientContacts_BillingContactId",
                table: "Quotes",
                column: "BillingContactId",
                principalTable: "ClientContacts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Quotes_ClientContacts_ContactId",
                table: "Quotes",
                column: "ContactId",
                principalTable: "ClientContacts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ProjectMaterials_ProjectAssemblies_ProjectAssemblyId",
                table: "ProjectMaterials");

            migrationBuilder.DropForeignKey(
                name: "FK_QuoteLines_Assemblies_AssemblyId",
                table: "QuoteLines");

            migrationBuilder.DropForeignKey(
                name: "FK_QuoteLines_Equipment_EquipmentId",
                table: "QuoteLines");

            migrationBuilder.DropForeignKey(
                name: "FK_QuoteLines_QuoteLines_ParentLineId",
                table: "QuoteLines");

            migrationBuilder.DropForeignKey(
                name: "FK_Quotes_ClientContacts_BillingContactId",
                table: "Quotes");

            migrationBuilder.DropForeignKey(
                name: "FK_Quotes_ClientContacts_ContactId",
                table: "Quotes");

            migrationBuilder.DropTable(
                name: "InvoiceAutoFees");

            migrationBuilder.DropTable(
                name: "ProjectTemplateLines");

            migrationBuilder.DropTable(
                name: "ProjectTemplates");

            migrationBuilder.DropIndex(
                name: "IX_Quotes_BillingContactId",
                table: "Quotes");

            migrationBuilder.DropIndex(
                name: "IX_Quotes_ContactId",
                table: "Quotes");

            migrationBuilder.DropIndex(
                name: "IX_Quotes_ResponseToken",
                table: "Quotes");

            migrationBuilder.DropIndex(
                name: "IX_QuoteLines_AssemblyId",
                table: "QuoteLines");

            migrationBuilder.DropIndex(
                name: "IX_QuoteLines_EquipmentId",
                table: "QuoteLines");

            migrationBuilder.DropIndex(
                name: "IX_QuoteLines_ParentLineId",
                table: "QuoteLines");

            migrationBuilder.DropIndex(
                name: "IX_ProjectMaterials_ProjectAssemblyId",
                table: "ProjectMaterials");

            migrationBuilder.DropColumn(
                name: "AssemblyId",
                table: "QuoteTemplateLines");

            migrationBuilder.DropColumn(
                name: "EquipmentId",
                table: "QuoteTemplateLines");

            migrationBuilder.DropColumn(
                name: "BillingContactId",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "ChangeRequestNote",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "ChangeRequestedAt",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "ContactId",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "ResponseToken",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "AssemblyId",
                table: "QuoteLines");

            migrationBuilder.DropColumn(
                name: "EquipmentId",
                table: "QuoteLines");

            migrationBuilder.DropColumn(
                name: "ParentLineId",
                table: "QuoteLines");

            migrationBuilder.DropColumn(
                name: "ProjectAssemblyId",
                table: "ProjectMaterials");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "ProjectExpenses");

            migrationBuilder.DropColumn(
                name: "QuoteEmailCanApprove",
                table: "BillingSettings");

            migrationBuilder.DropColumn(
                name: "QuoteEmailCanRefuse",
                table: "BillingSettings");

            migrationBuilder.DropColumn(
                name: "QuoteEmailCanRequestChange",
                table: "BillingSettings");
        }
    }
}
