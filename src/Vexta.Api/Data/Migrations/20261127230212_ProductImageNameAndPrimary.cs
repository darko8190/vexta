using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProductImageNameAndPrimary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPrimary",
                table: "ProductImages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "ProductImages",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            // The first picture of each product becomes its main one, as it already stood for it.
            migrationBuilder.Sql("""
                UPDATE "ProductImages" i SET "IsPrimary" = TRUE
                WHERE i."SortOrder" = (SELECT MIN(o."SortOrder") FROM "ProductImages" o WHERE o."ProductId" = i."ProductId");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsPrimary",
                table: "ProductImages");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "ProductImages");
        }
    }
}
