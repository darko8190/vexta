using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptScans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Zero for every plan that already exists, and that is deliberate: this is the one
            // thing Vexta sells that bills per use, and turning it on for paying customers
            // without being asked would put somebody else's API bill on the platform. A plan
            // created from here on starts at 100; an existing one is switched on by hand.
            migrationBuilder.AddColumn<int>(
                name: "MonthlyReceiptScans",
                table: "Plans",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "ReceiptScans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaAssetId = table.Column<Guid>(type: "uuid", nullable: true),
                    RequestedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    FoundSomething = table.Column<bool>(type: "boolean", nullable: false),
                    InputTokens = table.Column<int>(type: "integer", nullable: false),
                    OutputTokens = table.Column<int>(type: "integer", nullable: false),
                    Model = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReceiptScans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReceiptScans_MediaAssets_MediaAssetId",
                        column: x => x.MediaAssetId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptScans_MediaAssetId",
                table: "ReceiptScans",
                column: "MediaAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptScans_TenantId_CreatedAt",
                table: "ReceiptScans",
                columns: new[] { "TenantId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReceiptScans");

            migrationBuilder.DropColumn(
                name: "MonthlyReceiptScans",
                table: "Plans");
        }
    }
}
