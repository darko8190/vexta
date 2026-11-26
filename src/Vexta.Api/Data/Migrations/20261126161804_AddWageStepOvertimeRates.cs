using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWageStepOvertimeRates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CostDouble",
                table: "WageClassificationSteps",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CostTimeAndHalf",
                table: "WageClassificationSteps",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SellingDouble",
                table: "WageClassificationSteps",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SellingTimeAndHalf",
                table: "WageClassificationSteps",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WageDouble",
                table: "WageClassificationSteps",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WageTimeAndHalf",
                table: "WageClassificationSteps",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CostDouble",
                table: "WageClassificationSteps");

            migrationBuilder.DropColumn(
                name: "CostTimeAndHalf",
                table: "WageClassificationSteps");

            migrationBuilder.DropColumn(
                name: "SellingDouble",
                table: "WageClassificationSteps");

            migrationBuilder.DropColumn(
                name: "SellingTimeAndHalf",
                table: "WageClassificationSteps");

            migrationBuilder.DropColumn(
                name: "WageDouble",
                table: "WageClassificationSteps");

            migrationBuilder.DropColumn(
                name: "WageTimeAndHalf",
                table: "WageClassificationSteps");
        }
    }
}
