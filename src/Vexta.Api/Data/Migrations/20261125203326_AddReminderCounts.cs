using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReminderCounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ReminderCount",
                table: "Quotes",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ReminderCount",
                table: "Invoices",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "InvoiceReminderCount",
                table: "BillingSettings",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "QuoteReminderCount",
                table: "BillingSettings",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            // A reminder already sent for the current sending counts as the first, so turning
            // this on does not send those quotes and invoices a second one straight away.
            migrationBuilder.Sql(@"UPDATE ""Quotes"" SET ""ReminderCount"" = 1 WHERE ""ReminderSentAt"" IS NOT NULL AND ""SentAt"" IS NOT NULL AND ""ReminderSentAt"" >= ""SentAt"";");
            migrationBuilder.Sql(@"UPDATE ""Invoices"" SET ""ReminderCount"" = 1 WHERE ""ReminderSentAt"" IS NOT NULL AND ""SentAt"" IS NOT NULL AND ""ReminderSentAt"" >= ""SentAt"";");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReminderCount",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "ReminderCount",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "InvoiceReminderCount",
                table: "BillingSettings");

            migrationBuilder.DropColumn(
                name: "QuoteReminderCount",
                table: "BillingSettings");
        }
    }
}
