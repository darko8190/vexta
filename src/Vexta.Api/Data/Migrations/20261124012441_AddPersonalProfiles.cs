using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonalProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ApplicantUserId",
                table: "Candidates",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApplicationSummary",
                table: "Candidates",
                type: "character varying(8000)",
                maxLength: 8000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PersonalProfiles",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Phone = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    Headline = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Summary = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    City = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Province = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    Country = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    AvailableFrom = table.Column<DateOnly>(type: "date", nullable: true),
                    Skills = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ResumeMediaAssetId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PersonalProfiles", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_PersonalProfiles_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PersonalProfiles_MediaAssets_ResumeMediaAssetId",
                        column: x => x.ResumeMediaAssetId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "PersonalEducation",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Program = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    School = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CompletedYear = table.Column<int>(type: "integer", nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PersonalEducation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PersonalEducation_PersonalProfiles_UserId",
                        column: x => x.UserId,
                        principalTable: "PersonalProfiles",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PersonalExperiences",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Employer = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Location = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    StartedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    EndedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PersonalExperiences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PersonalExperiences_PersonalProfiles_UserId",
                        column: x => x.UserId,
                        principalTable: "PersonalProfiles",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Candidates_JobPostingId_ApplicantUserId",
                table: "Candidates",
                columns: new[] { "JobPostingId", "ApplicantUserId" },
                unique: true,
                filter: "\"ApplicantUserId\" IS NOT NULL AND \"JobPostingId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PersonalEducation_UserId_SortOrder",
                table: "PersonalEducation",
                columns: new[] { "UserId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_PersonalExperiences_UserId_SortOrder",
                table: "PersonalExperiences",
                columns: new[] { "UserId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_PersonalProfiles_ResumeMediaAssetId",
                table: "PersonalProfiles",
                column: "ResumeMediaAssetId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PersonalEducation");

            migrationBuilder.DropTable(
                name: "PersonalExperiences");

            migrationBuilder.DropTable(
                name: "PersonalProfiles");

            migrationBuilder.DropIndex(
                name: "IX_Candidates_JobPostingId_ApplicantUserId",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ApplicantUserId",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ApplicationSummary",
                table: "Candidates");
        }
    }
}
