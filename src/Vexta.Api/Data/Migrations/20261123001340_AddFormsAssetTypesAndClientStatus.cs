using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddFormsAssetTypesAndClientStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ClientAssetId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "Clients",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<Guid>(
                name: "AssetTypeId",
                table: "ClientAssets",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ClientAssetTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Icon = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientAssetTypes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FormTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SuccessMessage = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormTemplates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FormActions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FormTemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    Recipients = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    NewClientStatus = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormActions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormActions_FormTemplates_FormTemplateId",
                        column: x => x.FormTemplateId,
                        principalTable: "FormTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FormFields",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FormTemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    HelpText = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    IsRequired = table.Column<bool>(type: "boolean", nullable: false),
                    Options = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Target = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormFields", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormFields_FormTemplates_FormTemplateId",
                        column: x => x.FormTemplateId,
                        principalTable: "FormTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FormSubmissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FormTemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmittedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubmittedByName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedClientId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActionLog = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormSubmissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormSubmissions_Clients_CreatedClientId",
                        column: x => x.CreatedClientId,
                        principalTable: "Clients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_FormSubmissions_FormTemplates_FormTemplateId",
                        column: x => x.FormTemplateId,
                        principalTable: "FormTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FormAnswers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    FormFieldId = table.Column<Guid>(type: "uuid", nullable: true),
                    Label = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Value = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormAnswers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormAnswers_FormFields_FormFieldId",
                        column: x => x.FormFieldId,
                        principalTable: "FormFields",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_FormAnswers_FormSubmissions_SubmissionId",
                        column: x => x.SubmissionId,
                        principalTable: "FormSubmissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Projects_ClientAssetId",
                table: "Projects",
                column: "ClientAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_ClientAssets_AssetTypeId",
                table: "ClientAssets",
                column: "AssetTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_ClientAssetTypes_TenantId_Name",
                table: "ClientAssetTypes",
                columns: new[] { "TenantId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FormActions_FormTemplateId_SortOrder",
                table: "FormActions",
                columns: new[] { "FormTemplateId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_FormAnswers_FormFieldId",
                table: "FormAnswers",
                column: "FormFieldId");

            migrationBuilder.CreateIndex(
                name: "IX_FormAnswers_SubmissionId_SortOrder",
                table: "FormAnswers",
                columns: new[] { "SubmissionId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_FormFields_FormTemplateId_SortOrder",
                table: "FormFields",
                columns: new[] { "FormTemplateId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_CreatedClientId",
                table: "FormSubmissions",
                column: "CreatedClientId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_FormTemplateId_CreatedAt",
                table: "FormSubmissions",
                columns: new[] { "FormTemplateId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_FormTemplates_TenantId_SortOrder",
                table: "FormTemplates",
                columns: new[] { "TenantId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_ClientAssets_ClientAssetTypes_AssetTypeId",
                table: "ClientAssets",
                column: "AssetTypeId",
                principalTable: "ClientAssetTypes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_ClientAssets_ClientAssetId",
                table: "Projects",
                column: "ClientAssetId",
                principalTable: "ClientAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // The free-text category becomes a row on the company's own list, carrying whatever
            // spelling that company used. Written by hand because the scaffolder would simply
            // drop the column, and every asset already on file would forget what kind of thing
            // it is. DISTINCT on the trimmed value, not the raw one, so " Auto" and "Auto" do
            // not both try to claim the same name against the unique index.
            migrationBuilder.Sql("""
                INSERT INTO "ClientAssetTypes" ("Id", "TenantId", "Name", "CreatedAt")
                SELECT gen_random_uuid(), t."TenantId", t."Name", now()
                FROM (
                    SELECT DISTINCT "TenantId", btrim("Category") AS "Name"
                    FROM "ClientAssets"
                    WHERE "Category" IS NOT NULL AND btrim("Category") <> ''
                ) t;
                """);

            migrationBuilder.Sql("""
                UPDATE "ClientAssets" a
                SET "AssetTypeId" = t."Id"
                FROM "ClientAssetTypes" t
                WHERE t."TenantId" = a."TenantId"
                  AND t."Name" = btrim(a."Category")
                  AND a."Category" IS NOT NULL
                  AND btrim(a."Category") <> '';
                """);

            // Last, once nothing needs reading from it.
            migrationBuilder.DropColumn(
                name: "Category",
                table: "ClientAssets");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ClientAssets_ClientAssetTypes_AssetTypeId",
                table: "ClientAssets");

            migrationBuilder.DropForeignKey(
                name: "FK_Projects_ClientAssets_ClientAssetId",
                table: "Projects");

            migrationBuilder.DropTable(
                name: "ClientAssetTypes");

            migrationBuilder.DropTable(
                name: "FormActions");

            migrationBuilder.DropTable(
                name: "FormAnswers");

            migrationBuilder.DropTable(
                name: "FormFields");

            migrationBuilder.DropTable(
                name: "FormSubmissions");

            migrationBuilder.DropTable(
                name: "FormTemplates");

            migrationBuilder.DropIndex(
                name: "IX_Projects_ClientAssetId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_ClientAssets_AssetTypeId",
                table: "ClientAssets");

            migrationBuilder.DropColumn(
                name: "ClientAssetId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "AssetTypeId",
                table: "ClientAssets");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "ClientAssets",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);
        }
    }
}
