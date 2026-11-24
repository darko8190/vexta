using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddQuotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Quotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    PoNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    IssuedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    ValidUntil = table.Column<DateOnly>(type: "date", nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsTaxExempt = table.Column<bool>(type: "boolean", nullable: false),
                    ClientAssetId = table.Column<Guid>(type: "uuid", nullable: true),
                    ClientAddressId = table.Column<Guid>(type: "uuid", nullable: true),
                    SameAddressAsClient = table.Column<bool>(type: "boolean", nullable: false),
                    SiteAddressId = table.Column<Guid>(type: "uuid", nullable: true),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubCategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    WageClassificationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Quotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Quotes_Addresses_ClientAddressId",
                        column: x => x.ClientAddressId,
                        principalTable: "Addresses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Quotes_Addresses_SiteAddressId",
                        column: x => x.SiteAddressId,
                        principalTable: "Addresses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Quotes_ClientAssets_ClientAssetId",
                        column: x => x.ClientAssetId,
                        principalTable: "ClientAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Quotes_Clients_ClientId",
                        column: x => x.ClientId,
                        principalTable: "Clients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Quotes_ProjectCategories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "ProjectCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Quotes_ProjectSubCategories_SubCategoryId",
                        column: x => x.SubCategoryId,
                        principalTable: "ProjectSubCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Quotes_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Quotes_WageClassifications_WageClassificationId",
                        column: x => x.WageClassificationId,
                        principalTable: "WageClassifications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "QuoteLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    Code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Unit = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: true),
                    UnitPrice = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuoteLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QuoteLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_QuoteLines_Quotes_QuoteId",
                        column: x => x.QuoteId,
                        principalTable: "Quotes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QuoteLines_ProductId",
                table: "QuoteLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_QuoteLines_QuoteId_Kind_SortOrder",
                table: "QuoteLines",
                columns: new[] { "QuoteId", "Kind", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_CategoryId",
                table: "Quotes",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_ClientAddressId",
                table: "Quotes",
                column: "ClientAddressId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_ClientAssetId",
                table: "Quotes",
                column: "ClientAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_ClientId",
                table: "Quotes",
                column: "ClientId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_ProjectId",
                table: "Quotes",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_SiteAddressId",
                table: "Quotes",
                column: "SiteAddressId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_SubCategoryId",
                table: "Quotes",
                column: "SubCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_TenantId_Number",
                table: "Quotes",
                columns: new[] { "TenantId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Quotes_WageClassificationId",
                table: "Quotes",
                column: "WageClassificationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QuoteLines");

            migrationBuilder.DropTable(
                name: "Quotes");
        }
    }
}
