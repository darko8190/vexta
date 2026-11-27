using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProductIsParent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsParent",
                table: "Products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // A product that already has variants is a parent.
            migrationBuilder.Sql("""
                UPDATE "Products" p SET "IsParent" = TRUE
                WHERE EXISTS (SELECT 1 FROM "Products" v WHERE v."ParentProductId" = p."Id");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsParent",
                table: "Products");
        }
    }
}
