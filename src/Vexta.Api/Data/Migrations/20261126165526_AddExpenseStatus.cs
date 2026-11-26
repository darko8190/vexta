using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddExpenseStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "ProjectExpenses",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Expenses filed before there was a state were already accepted as they stood.
            migrationBuilder.Sql("UPDATE \"ProjectExpenses\" SET \"Status\" = 1;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Status",
                table: "ProjectExpenses");
        }
    }
}
