using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPlanMinUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1, not EF's 0: a plan is sold to at least one person. Zero would print
            // "de 0 à 5 utilisateurs" on the pricing page of every plan that already exists.
            migrationBuilder.AddColumn<int>(
                name: "MinUsers",
                table: "Plans",
                type: "integer",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MinUsers",
                table: "Plans");
        }
    }
}
