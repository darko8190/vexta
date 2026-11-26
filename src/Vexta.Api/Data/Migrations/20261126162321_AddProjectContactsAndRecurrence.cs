using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectContactsAndRecurrence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BillingContactId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ContactId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "RecurrenceEndDate",
                table: "Projects",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceEvery",
                table: "Projects",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "RecurrenceNextDate",
                table: "Projects",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceUnit",
                table: "Projects",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "RecurringFromId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Projects_BillingContactId",
                table: "Projects",
                column: "BillingContactId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_ContactId",
                table: "Projects",
                column: "ContactId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_RecurrenceNextDate",
                table: "Projects",
                column: "RecurrenceNextDate");

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_ClientContacts_BillingContactId",
                table: "Projects",
                column: "BillingContactId",
                principalTable: "ClientContacts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_ClientContacts_ContactId",
                table: "Projects",
                column: "ContactId",
                principalTable: "ClientContacts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Projects_ClientContacts_BillingContactId",
                table: "Projects");

            migrationBuilder.DropForeignKey(
                name: "FK_Projects_ClientContacts_ContactId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_Projects_BillingContactId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_Projects_ContactId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_Projects_RecurrenceNextDate",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "BillingContactId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "ContactId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "RecurrenceEndDate",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "RecurrenceEvery",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "RecurrenceNextDate",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "RecurrenceUnit",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "RecurringFromId",
                table: "Projects");
        }
    }
}
