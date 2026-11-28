using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PublicPageHeaderFooter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "FooterShowAddress",
                table: "PublicPages",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "FooterShowEmail",
                table: "PublicPages",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "FooterShowPhone",
                table: "PublicPages",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "FooterText",
                table: "PublicPages",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FooterTitle",
                table: "PublicPages",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShowAbout",
                table: "PublicPages",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShowHeadline",
                table: "PublicPages",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShowLogo",
                table: "PublicPages",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FooterShowAddress",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "FooterShowEmail",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "FooterShowPhone",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "FooterText",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "FooterTitle",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "ShowAbout",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "ShowHeadline",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "ShowLogo",
                table: "PublicPages");
        }
    }
}
