using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectMaterialsTimesheetsAndUnits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Unit",
                table: "Products",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "BillingSettings",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                // CAD, not an empty string: every existing invoice was issued in dollars, and a
                // company that had already filled this card must not find its currency blank.
                defaultValue: "CAD");

            // The statuses a project can be in changed. The numbers that kept their meaning are
            // left alone; the two that did not are moved here, because a stored 2 that used to
            // read "En pause" would now read "À facturer" — a job nobody worked on, waiting to
            // be billed.
            //
            // En pause (2) becomes Commencé (1): a paused job is a job that was started.
            migrationBuilder.Sql(@"UPDATE ""Projects"" SET ""Status"" = 1 WHERE ""Status"" = 2;");

            // Terminé (3) splits in two. An invoiced job keeps 3, which now reads Facturé; a
            // finished job with nothing billed against it becomes À facturer, which is exactly
            // the list the office wants on a Monday morning.
            migrationBuilder.Sql(@"
                UPDATE ""Projects"" SET ""Status"" = 2
                WHERE ""Status"" = 3
                  AND NOT EXISTS (
                      SELECT 1 FROM ""Invoices"" i WHERE i.""ProjectId"" = ""Projects"".""Id"");");

            migrationBuilder.CreateTable(
                name: "ProjectMaterials",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    Code = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    PurchasePrice = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: true),
                    MarginPercent = table.Column<decimal>(type: "numeric(6,3)", precision: 6, scale: 3, nullable: true),
                    UnitPrice = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectMaterials", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectMaterials_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ProjectMaterials_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TimesheetEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uuid", nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    Hours = table.Column<decimal>(type: "numeric(8,2)", precision: 8, scale: 2, nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimesheetEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimesheetEntries_Employees_EmployeeId",
                        column: x => x.EmployeeId,
                        principalTable: "Employees",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_TimesheetEntries_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMaterials_ProductId",
                table: "ProjectMaterials",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMaterials_ProjectId_SortOrder",
                table: "ProjectMaterials",
                columns: new[] { "ProjectId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_TimesheetEntries_EmployeeId",
                table: "TimesheetEntries",
                column: "EmployeeId");

            migrationBuilder.CreateIndex(
                name: "IX_TimesheetEntries_ProjectId_StartDate",
                table: "TimesheetEntries",
                columns: new[] { "ProjectId", "StartDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectMaterials");

            migrationBuilder.DropTable(
                name: "TimesheetEntries");

            migrationBuilder.DropColumn(
                name: "Unit",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "Currency",
                table: "BillingSettings");

            // The status split cannot be undone: once a finished project has been told apart
            // from a billed one, there is nothing left that says which of the two it was. Going
            // back puts both under Terminé (3), which is where they came from.
            migrationBuilder.Sql(@"UPDATE ""Projects"" SET ""Status"" = 3 WHERE ""Status"" = 2;");
        }
    }
}
