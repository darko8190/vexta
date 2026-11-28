using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <summary>
    /// The « Commandes en ligne » tab becomes « À traiter », holding the customer orders and the
    /// projects to assign. Only a title still at its built-in value is renamed: one an
    /// administrator changed stays theirs.
    /// </summary>
    [DbContext(typeof(VextaDbContext))]
    [Migration("20261128150000_ATraiterTab")]
    public partial class ATraiterTab : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Modules"
                SET "Title" = 'À traiter',
                    "Description" = 'Les commandes des clients et les projets qui attendent une équipe.',
                    "Icon" = 'Inbox'
                WHERE "NavHref" = '/commandes' AND "Title" = 'Commandes en ligne';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Modules"
                SET "Title" = 'Commandes en ligne',
                    "Description" = 'Les commandes reçues par la page publique, et les factures qui en sortent.',
                    "Icon" = 'ShoppingBag'
                WHERE "NavHref" = '/commandes' AND "Title" = 'À traiter';
                """);
        }
    }
}
