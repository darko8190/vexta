using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddFormKindAndPublicForms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ShowForms",
                table: "PublicPages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Kind",
                table: "FormTemplates",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "ShowOnPublicPage",
                table: "FormTemplates",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedClientAssetId",
                table: "FormSubmissions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "FromPublicPage",
                table: "FormSubmissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "NewAssetTypeId",
                table: "FormActions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NewAssetUsageUnit",
                table: "FormActions",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_FormTemplates_TenantId_ShowOnPublicPage",
                table: "FormTemplates",
                columns: new[] { "TenantId", "ShowOnPublicPage" });

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_CreatedClientAssetId",
                table: "FormSubmissions",
                column: "CreatedClientAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_FormActions_NewAssetTypeId",
                table: "FormActions",
                column: "NewAssetTypeId");

            migrationBuilder.AddForeignKey(
                name: "FK_FormActions_ClientAssetTypes_NewAssetTypeId",
                table: "FormActions",
                column: "NewAssetTypeId",
                principalTable: "ClientAssetTypes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_FormSubmissions_ClientAssets_CreatedClientAssetId",
                table: "FormSubmissions",
                column: "CreatedClientAssetId",
                principalTable: "ClientAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FormActions_ClientAssetTypes_NewAssetTypeId",
                table: "FormActions");

            migrationBuilder.DropForeignKey(
                name: "FK_FormSubmissions_ClientAssets_CreatedClientAssetId",
                table: "FormSubmissions");

            migrationBuilder.DropIndex(
                name: "IX_FormTemplates_TenantId_ShowOnPublicPage",
                table: "FormTemplates");

            migrationBuilder.DropIndex(
                name: "IX_FormSubmissions_CreatedClientAssetId",
                table: "FormSubmissions");

            migrationBuilder.DropIndex(
                name: "IX_FormActions_NewAssetTypeId",
                table: "FormActions");

            migrationBuilder.DropColumn(
                name: "ShowForms",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "FormTemplates");

            migrationBuilder.DropColumn(
                name: "ShowOnPublicPage",
                table: "FormTemplates");

            migrationBuilder.DropColumn(
                name: "CreatedClientAssetId",
                table: "FormSubmissions");

            migrationBuilder.DropColumn(
                name: "FromPublicPage",
                table: "FormSubmissions");

            migrationBuilder.DropColumn(
                name: "NewAssetTypeId",
                table: "FormActions");

            migrationBuilder.DropColumn(
                name: "NewAssetUsageUnit",
                table: "FormActions");
        }
    }
}
