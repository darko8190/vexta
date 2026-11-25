using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddQuoteReminders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReminderSentAt",
                table: "Quotes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SentTo",
                table: "Quotes",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "QuoteReminderDays",
                table: "BillingSettings",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReminderSentAt",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "SentTo",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "QuoteReminderDays",
                table: "BillingSettings");
        }
    }
}
