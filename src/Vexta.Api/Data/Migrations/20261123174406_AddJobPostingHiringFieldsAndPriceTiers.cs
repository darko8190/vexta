using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddJobPostingHiringFieldsAndPriceTiers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "ClosesOn",
                table: "JobPostings",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "JobPostings",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            // One, not zero. Every posting already on file is for at least one person, and a
            // generated default of 0 would say the company is advertising positions it is not
            // hiring for.
            migrationBuilder.AddColumn<int>(
                name: "Openings",
                table: "JobPostings",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<DateOnly>(
                name: "PostedOn",
                table: "JobPostings",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "JobPostings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // The status is now what decides whether a posting is advertised, and the generated
            // default is Brouillon — so without this every position a company already had on its
            // public page would come off it on deploy. Read from the flag that used to be the
            // only answer: published means Publiee, and anything else was already down, which is
            // Fermee rather than Pourvue because nothing on file says whether anyone was hired.
            migrationBuilder.Sql(
                """
                UPDATE "JobPostings" SET "Status" = CASE WHEN "IsPublished" THEN 1 ELSE 3 END;
                """);

            // Dated from when the row was created: it is the only evidence left of when the
            // position went out, and a null here would read as "still a draft".
            migrationBuilder.Sql(
                """
                UPDATE "JobPostings" SET "PostedOn" = ("CreatedAt" AT TIME ZONE 'America/Toronto')::date
                WHERE "IsPublished";
                """);

            migrationBuilder.AddColumn<Guid>(
                name: "JobPostingId",
                table: "Candidates",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PricePolicyTiers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PricePolicyId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromAmount = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    ToAmount = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: true),
                    MarginPercent = table.Column<decimal>(type: "numeric(6,3)", precision: 6, scale: 3, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PricePolicyTiers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PricePolicyTiers_PricePolicies_PricePolicyId",
                        column: x => x.PricePolicyId,
                        principalTable: "PricePolicies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_JobPostings_TenantId_Status",
                table: "JobPostings",
                columns: new[] { "TenantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Candidates_JobPostingId",
                table: "Candidates",
                column: "JobPostingId");

            migrationBuilder.CreateIndex(
                name: "IX_PricePolicyTiers_PricePolicyId_FromAmount",
                table: "PricePolicyTiers",
                columns: new[] { "PricePolicyId", "FromAmount" });

            migrationBuilder.AddForeignKey(
                name: "FK_Candidates_JobPostings_JobPostingId",
                table: "Candidates",
                column: "JobPostingId",
                principalTable: "JobPostings",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Candidates_JobPostings_JobPostingId",
                table: "Candidates");

            migrationBuilder.DropTable(
                name: "PricePolicyTiers");

            migrationBuilder.DropIndex(
                name: "IX_JobPostings_TenantId_Status",
                table: "JobPostings");

            migrationBuilder.DropIndex(
                name: "IX_Candidates_JobPostingId",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ClosesOn",
                table: "JobPostings");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "JobPostings");

            migrationBuilder.DropColumn(
                name: "Openings",
                table: "JobPostings");

            migrationBuilder.DropColumn(
                name: "PostedOn",
                table: "JobPostings");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "JobPostings");

            migrationBuilder.DropColumn(
                name: "JobPostingId",
                table: "Candidates");
        }
    }
}
