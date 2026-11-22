using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddClientAssetsAccountsAndPayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccountBlockedReason",
                table: "Clients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BlockedReason",
                table: "Clients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsAccountBlocked",
                table: "Clients",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsBlocked",
                table: "Clients",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "ClientAccountEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: true),
                    InvoicePaymentId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientAccountEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ClientAccountEntries_Clients_ClientId",
                        column: x => x.ClientId,
                        principalTable: "Clients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ClientAccountEntries_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ClientAssets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Make = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    Model = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    Year = table.Column<int>(type: "integer", nullable: true),
                    SerialNumber = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    Reference = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Usage = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: true),
                    UsageUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    AddressId = table.Column<Guid>(type: "uuid", nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientAssets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ClientAssets_Addresses_AddressId",
                        column: x => x.AddressId,
                        principalTable: "Addresses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ClientAssets_Clients_ClientId",
                        column: x => x.ClientId,
                        principalTable: "Clients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InvoicePayments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    Method = table.Column<int>(type: "integer", nullable: false),
                    Reference = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    Note = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoicePayments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoicePayments_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClientAccountEntries_ClientId_Date",
                table: "ClientAccountEntries",
                columns: new[] { "ClientId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_ClientAccountEntries_InvoiceId",
                table: "ClientAccountEntries",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_ClientAssets_AddressId",
                table: "ClientAssets",
                column: "AddressId");

            migrationBuilder.CreateIndex(
                name: "IX_ClientAssets_ClientId",
                table: "ClientAssets",
                column: "ClientId");

            migrationBuilder.CreateIndex(
                name: "IX_ClientAssets_TenantId_Reference",
                table: "ClientAssets",
                columns: new[] { "TenantId", "Reference" });

            migrationBuilder.CreateIndex(
                name: "IX_ClientAssets_TenantId_SerialNumber",
                table: "ClientAssets",
                columns: new[] { "TenantId", "SerialNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_InvoicePayments_InvoiceId_Date",
                table: "InvoicePayments",
                columns: new[] { "InvoiceId", "Date" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ClientAccountEntries");

            migrationBuilder.DropTable(
                name: "ClientAssets");

            migrationBuilder.DropTable(
                name: "InvoicePayments");

            migrationBuilder.DropColumn(
                name: "AccountBlockedReason",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "BlockedReason",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "IsAccountBlocked",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "IsBlocked",
                table: "Clients");
        }
    }
}
