using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProjectSettingsAndPunch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "HourlyRate",
                table: "TimesheetEntries",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PausedAt",
                table: "TimesheetEntries",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PausedSeconds",
                table: "TimesheetEntries",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PunchStartedAt",
                table: "TimesheetEntries",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PunchState",
                table: "TimesheetEntries",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AlterColumn<Guid>(
                name: "ProjectId",
                table: "ProjectTasks",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "TaskTypeId",
                table: "ProjectTasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PriorityId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LabourMode",
                table: "BillingSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "ProjectPrioritiesSeeded",
                table: "BillingSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "ProjectPriorities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectPriorities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TaskTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTypes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProjectAutoLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Event = table.Column<int>(type: "integer", nullable: false),
                    TaskTypeId = table.Column<Guid>(type: "uuid", nullable: true),
                    Section = table.Column<int>(type: "integer", nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: true),
                    UnitPrice = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectAutoLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectAutoLines_TaskTypes_TaskTypeId",
                        column: x => x.TaskTypeId,
                        principalTable: "TaskTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectTasks_TaskTypeId",
                table: "ProjectTasks",
                column: "TaskTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_PriorityId",
                table: "Projects",
                column: "PriorityId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectAutoLines_TaskTypeId",
                table: "ProjectAutoLines",
                column: "TaskTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectAutoLines_TenantId_SortOrder",
                table: "ProjectAutoLines",
                columns: new[] { "TenantId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectPriorities_TenantId_SortOrder",
                table: "ProjectPriorities",
                columns: new[] { "TenantId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_TaskTypes_TenantId_SortOrder",
                table: "TaskTypes",
                columns: new[] { "TenantId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_ProjectPriorities_PriorityId",
                table: "Projects",
                column: "PriorityId",
                principalTable: "ProjectPriorities",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ProjectTasks_TaskTypes_TaskTypeId",
                table: "ProjectTasks",
                column: "TaskTypeId",
                principalTable: "TaskTypes",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Projects_ProjectPriorities_PriorityId",
                table: "Projects");

            migrationBuilder.DropForeignKey(
                name: "FK_ProjectTasks_TaskTypes_TaskTypeId",
                table: "ProjectTasks");

            migrationBuilder.DropTable(
                name: "ProjectAutoLines");

            migrationBuilder.DropTable(
                name: "ProjectPriorities");

            migrationBuilder.DropTable(
                name: "TaskTypes");

            migrationBuilder.DropIndex(
                name: "IX_ProjectTasks_TaskTypeId",
                table: "ProjectTasks");

            migrationBuilder.DropIndex(
                name: "IX_Projects_PriorityId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "HourlyRate",
                table: "TimesheetEntries");

            migrationBuilder.DropColumn(
                name: "PausedAt",
                table: "TimesheetEntries");

            migrationBuilder.DropColumn(
                name: "PausedSeconds",
                table: "TimesheetEntries");

            migrationBuilder.DropColumn(
                name: "PunchStartedAt",
                table: "TimesheetEntries");

            migrationBuilder.DropColumn(
                name: "PunchState",
                table: "TimesheetEntries");

            migrationBuilder.DropColumn(
                name: "TaskTypeId",
                table: "ProjectTasks");

            migrationBuilder.DropColumn(
                name: "PriorityId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "LabourMode",
                table: "BillingSettings");

            migrationBuilder.DropColumn(
                name: "ProjectPrioritiesSeeded",
                table: "BillingSettings");

            migrationBuilder.AlterColumn<Guid>(
                name: "ProjectId",
                table: "ProjectTasks",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
