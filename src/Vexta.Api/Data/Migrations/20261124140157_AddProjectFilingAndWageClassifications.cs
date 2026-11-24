using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectFilingAndWageClassifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CategoryId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SubCategoryId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "WageClassificationId",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProjectCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectCategories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WageClassifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WageClassifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProjectSubCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectSubCategories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectSubCategories_ProjectCategories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "ProjectCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WageClassificationSteps",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClassificationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Wage = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    Cost = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    Selling = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WageClassificationSteps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WageClassificationSteps_WageClassifications_ClassificationId",
                        column: x => x.ClassificationId,
                        principalTable: "WageClassifications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Projects_CategoryId",
                table: "Projects",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_SubCategoryId",
                table: "Projects",
                column: "SubCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_WageClassificationId",
                table: "Projects",
                column: "WageClassificationId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCategories_TenantId_Name",
                table: "ProjectCategories",
                columns: new[] { "TenantId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectSubCategories_CategoryId_Name",
                table: "ProjectSubCategories",
                columns: new[] { "CategoryId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WageClassifications_TenantId_Name",
                table: "WageClassifications",
                columns: new[] { "TenantId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WageClassificationSteps_ClassificationId_SortOrder",
                table: "WageClassificationSteps",
                columns: new[] { "ClassificationId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_ProjectCategories_CategoryId",
                table: "Projects",
                column: "CategoryId",
                principalTable: "ProjectCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_ProjectSubCategories_SubCategoryId",
                table: "Projects",
                column: "SubCategoryId",
                principalTable: "ProjectSubCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_WageClassifications_WageClassificationId",
                table: "Projects",
                column: "WageClassificationId",
                principalTable: "WageClassifications",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Projects_ProjectCategories_CategoryId",
                table: "Projects");

            migrationBuilder.DropForeignKey(
                name: "FK_Projects_ProjectSubCategories_SubCategoryId",
                table: "Projects");

            migrationBuilder.DropForeignKey(
                name: "FK_Projects_WageClassifications_WageClassificationId",
                table: "Projects");

            migrationBuilder.DropTable(
                name: "ProjectSubCategories");

            migrationBuilder.DropTable(
                name: "WageClassificationSteps");

            migrationBuilder.DropTable(
                name: "ProjectCategories");

            migrationBuilder.DropTable(
                name: "WageClassifications");

            migrationBuilder.DropIndex(
                name: "IX_Projects_CategoryId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_Projects_SubCategoryId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_Projects_WageClassificationId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "SubCategoryId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "WageClassificationId",
                table: "Projects");
        }
    }
}
