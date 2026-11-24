using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddFormFileAnswers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "MediaAssetId",
                table: "FormAnswers",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_FormAnswers_MediaAssetId",
                table: "FormAnswers",
                column: "MediaAssetId");

            migrationBuilder.AddForeignKey(
                name: "FK_FormAnswers_MediaAssets_MediaAssetId",
                table: "FormAnswers",
                column: "MediaAssetId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FormAnswers_MediaAssets_MediaAssetId",
                table: "FormAnswers");

            migrationBuilder.DropIndex(
                name: "IX_FormAnswers_MediaAssetId",
                table: "FormAnswers");

            migrationBuilder.DropColumn(
                name: "MediaAssetId",
                table: "FormAnswers");
        }
    }
}
