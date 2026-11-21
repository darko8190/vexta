using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMediaCompression : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContentEncoding",
                table: "MediaAssets",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "OriginalSizeBytes",
                table: "MediaAssets",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContentEncoding",
                table: "MediaAssets");

            migrationBuilder.DropColumn(
                name: "OriginalSizeBytes",
                table: "MediaAssets");
        }
    }
}
