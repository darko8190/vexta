using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskOnProjectLines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ProjectTaskId",
                table: "TimesheetEntries",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProjectTaskId",
                table: "ProjectMaterials",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProjectTaskId",
                table: "ProjectExtraCharges",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProjectTaskId",
                table: "ProjectExpenses",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TimesheetEntries_ProjectTaskId",
                table: "TimesheetEntries",
                column: "ProjectTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMaterials_ProjectTaskId",
                table: "ProjectMaterials",
                column: "ProjectTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectExtraCharges_ProjectTaskId",
                table: "ProjectExtraCharges",
                column: "ProjectTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectExpenses_ProjectTaskId",
                table: "ProjectExpenses",
                column: "ProjectTaskId");

            migrationBuilder.AddForeignKey(
                name: "FK_ProjectExpenses_ProjectTasks_ProjectTaskId",
                table: "ProjectExpenses",
                column: "ProjectTaskId",
                principalTable: "ProjectTasks",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ProjectExtraCharges_ProjectTasks_ProjectTaskId",
                table: "ProjectExtraCharges",
                column: "ProjectTaskId",
                principalTable: "ProjectTasks",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ProjectMaterials_ProjectTasks_ProjectTaskId",
                table: "ProjectMaterials",
                column: "ProjectTaskId",
                principalTable: "ProjectTasks",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_TimesheetEntries_ProjectTasks_ProjectTaskId",
                table: "TimesheetEntries",
                column: "ProjectTaskId",
                principalTable: "ProjectTasks",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ProjectExpenses_ProjectTasks_ProjectTaskId",
                table: "ProjectExpenses");

            migrationBuilder.DropForeignKey(
                name: "FK_ProjectExtraCharges_ProjectTasks_ProjectTaskId",
                table: "ProjectExtraCharges");

            migrationBuilder.DropForeignKey(
                name: "FK_ProjectMaterials_ProjectTasks_ProjectTaskId",
                table: "ProjectMaterials");

            migrationBuilder.DropForeignKey(
                name: "FK_TimesheetEntries_ProjectTasks_ProjectTaskId",
                table: "TimesheetEntries");

            migrationBuilder.DropIndex(
                name: "IX_TimesheetEntries_ProjectTaskId",
                table: "TimesheetEntries");

            migrationBuilder.DropIndex(
                name: "IX_ProjectMaterials_ProjectTaskId",
                table: "ProjectMaterials");

            migrationBuilder.DropIndex(
                name: "IX_ProjectExtraCharges_ProjectTaskId",
                table: "ProjectExtraCharges");

            migrationBuilder.DropIndex(
                name: "IX_ProjectExpenses_ProjectTaskId",
                table: "ProjectExpenses");

            migrationBuilder.DropColumn(
                name: "ProjectTaskId",
                table: "TimesheetEntries");

            migrationBuilder.DropColumn(
                name: "ProjectTaskId",
                table: "ProjectMaterials");

            migrationBuilder.DropColumn(
                name: "ProjectTaskId",
                table: "ProjectExtraCharges");

            migrationBuilder.DropColumn(
                name: "ProjectTaskId",
                table: "ProjectExpenses");
        }
    }
}
