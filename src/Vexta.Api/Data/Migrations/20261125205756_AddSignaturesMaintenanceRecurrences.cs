using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSignaturesMaintenanceRecurrences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "ClientSignaturePng",
                table: "Quotes",
                type: "bytea",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AssetMaintenances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientAssetId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    IntervalMonths = table.Column<int>(type: "integer", nullable: false),
                    NextDue = table.Column<DateOnly>(type: "date", nullable: false),
                    RemindDaysBefore = table.Column<int>(type: "integer", nullable: true),
                    RemindedFor = table.Column<DateOnly>(type: "date", nullable: true),
                    RemindedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastDoneOn = table.Column<DateOnly>(type: "date", nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetMaintenances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssetMaintenances_ClientAssets_ClientAssetId",
                        column: x => x.ClientAssetId,
                        principalTable: "ClientAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RecurringInvoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceInvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    IntervalMonths = table.Column<int>(type: "integer", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Periods = table.Column<int>(type: "integer", nullable: false),
                    NextIssueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    AutoSend = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    LastInvoiceId = table.Column<Guid>(type: "uuid", nullable: true),
                    LastIssuedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastProblem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecurringInvoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RecurringInvoices_Clients_ClientId",
                        column: x => x.ClientId,
                        principalTable: "Clients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RecurringInvoices_Invoices_LastInvoiceId",
                        column: x => x.LastInvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_RecurringInvoices_Invoices_SourceInvoiceId",
                        column: x => x.SourceInvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssetMaintenances_ClientAssetId",
                table: "AssetMaintenances",
                column: "ClientAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_AssetMaintenances_TenantId_NextDue",
                table: "AssetMaintenances",
                columns: new[] { "TenantId", "NextDue" });

            migrationBuilder.CreateIndex(
                name: "IX_RecurringInvoices_ClientId",
                table: "RecurringInvoices",
                column: "ClientId");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringInvoices_LastInvoiceId",
                table: "RecurringInvoices",
                column: "LastInvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringInvoices_SourceInvoiceId",
                table: "RecurringInvoices",
                column: "SourceInvoiceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RecurringInvoices_TenantId_IsActive_NextIssueDate",
                table: "RecurringInvoices",
                columns: new[] { "TenantId", "IsActive", "NextIssueDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AssetMaintenances");

            migrationBuilder.DropTable(
                name: "RecurringInvoices");

            migrationBuilder.DropColumn(
                name: "ClientSignaturePng",
                table: "Quotes");
        }
    }
}
