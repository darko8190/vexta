using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCountryBusinessNumberPageStyleAndJobForms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BusinessNumber",
                table: "Tenants",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "Suppliers",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Style",
                table: "PublicPages",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "FormTemplateId",
                table: "JobPostings",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "JobPostingDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    JobPostingId = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaAssetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobPostingDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_JobPostingDocuments_JobPostings_JobPostingId",
                        column: x => x.JobPostingId,
                        principalTable: "JobPostings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_JobPostingDocuments_MediaAssets_MediaAssetId",
                        column: x => x.MediaAssetId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_JobPostings_FormTemplateId",
                table: "JobPostings",
                column: "FormTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_JobPostingDocuments_JobPostingId_SortOrder",
                table: "JobPostingDocuments",
                columns: new[] { "JobPostingId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_JobPostingDocuments_MediaAssetId",
                table: "JobPostingDocuments",
                column: "MediaAssetId");

            migrationBuilder.AddForeignKey(
                name: "FK_JobPostings_FormTemplates_FormTemplateId",
                table: "JobPostings",
                column: "FormTemplateId",
                principalTable: "FormTemplates",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_JobPostings_FormTemplates_FormTemplateId",
                table: "JobPostings");

            migrationBuilder.DropTable(
                name: "JobPostingDocuments");

            migrationBuilder.DropIndex(
                name: "IX_JobPostings_FormTemplateId",
                table: "JobPostings");

            migrationBuilder.DropColumn(
                name: "BusinessNumber",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "Suppliers");

            migrationBuilder.DropColumn(
                name: "Style",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "FormTemplateId",
                table: "JobPostings");
        }
    }
}
