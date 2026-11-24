using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderOnlinePayment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "RequiresOnlinePayment",
                table: "PublicPages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "AmountPaid",
                table: "CustomerOrders",
                type: "numeric(14,2)",
                precision: 14,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PaidAt",
                table: "CustomerOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeCheckoutSessionId",
                table: "CustomerOrders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripePaymentReference",
                table: "CustomerOrders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RequiresOnlinePayment",
                table: "PublicPages");

            migrationBuilder.DropColumn(
                name: "AmountPaid",
                table: "CustomerOrders");

            migrationBuilder.DropColumn(
                name: "PaidAt",
                table: "CustomerOrders");

            migrationBuilder.DropColumn(
                name: "StripeCheckoutSessionId",
                table: "CustomerOrders");

            migrationBuilder.DropColumn(
                name: "StripePaymentReference",
                table: "CustomerOrders");
        }
    }
}
