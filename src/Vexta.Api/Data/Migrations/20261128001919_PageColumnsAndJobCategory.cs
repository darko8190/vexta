using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PageColumnsAndJobCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CellsJson",
                table: "PublicPageSections",
                type: "jsonb",
                nullable: false,
                defaultValueSql: "'[]'::jsonb");

            migrationBuilder.AddColumn<List<Guid>>(
                name: "FormTemplateIds",
                table: "PublicPageSections",
                type: "uuid[]",
                nullable: false,
                defaultValueSql: "'{}'::uuid[]");

            migrationBuilder.AddColumn<int>(
                name: "Background",
                table: "PublicPageSections",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Every band saved so far becomes a band of one column holding what it held. Its
            // old column count said how many photographs or products across, which is what the
            // column's ItemsPerRow now says.
            migrationBuilder.Sql("""
                UPDATE "PublicPageSections"
                SET "CellsJson" = jsonb_build_array(jsonb_build_object(
                    'Kind', "Kind",
                    'Title', NULL,
                    'Text', "Text",
                    'GalleryId', "GalleryId",
                    'MediaAssetId', "MediaAssetId",
                    'FormTemplateId', NULL,
                    'ItemsPerRow', GREATEST(1, LEAST(6, "Columns")),
                    'Shape', 0));
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_PublicPageSections_Galleries_GalleryId",
                table: "PublicPageSections");

            migrationBuilder.DropForeignKey(
                name: "FK_PublicPageSections_MediaAssets_MediaAssetId",
                table: "PublicPageSections");

            migrationBuilder.DropIndex(
                name: "IX_PublicPageSections_GalleryId",
                table: "PublicPageSections");

            migrationBuilder.DropIndex(
                name: "IX_PublicPageSections_MediaAssetId",
                table: "PublicPageSections");

            migrationBuilder.DropColumn(name: "Columns", table: "PublicPageSections");
            migrationBuilder.DropColumn(name: "GalleryId", table: "PublicPageSections");
            migrationBuilder.DropColumn(name: "MediaAssetId", table: "PublicPageSections");
            migrationBuilder.DropColumn(name: "Text", table: "PublicPageSections");
            migrationBuilder.DropColumn(name: "Kind", table: "PublicPageSections");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "JobPostings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CellsJson",
                table: "PublicPageSections");

            migrationBuilder.DropColumn(
                name: "FormTemplateIds",
                table: "PublicPageSections");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "JobPostings");

            migrationBuilder.RenameColumn(
                name: "Background",
                table: "PublicPageSections",
                newName: "Kind");

            migrationBuilder.AddColumn<int>(
                name: "Columns",
                table: "PublicPageSections",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "GalleryId",
                table: "PublicPageSections",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "MediaAssetId",
                table: "PublicPageSections",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Text",
                table: "PublicPageSections",
                type: "character varying(8000)",
                maxLength: 8000,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PublicPageSections_GalleryId",
                table: "PublicPageSections",
                column: "GalleryId");

            migrationBuilder.CreateIndex(
                name: "IX_PublicPageSections_MediaAssetId",
                table: "PublicPageSections",
                column: "MediaAssetId");

            migrationBuilder.AddForeignKey(
                name: "FK_PublicPageSections_Galleries_GalleryId",
                table: "PublicPageSections",
                column: "GalleryId",
                principalTable: "Galleries",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_PublicPageSections_MediaAssets_MediaAssetId",
                table: "PublicPageSections",
                column: "MediaAssetId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
