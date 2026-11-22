using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddModuleNavigation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NavHref",
                table: "Modules",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "OwnerOnly",
                table: "Modules",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentModuleId",
                table: "Modules",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Modules_ParentModuleId",
                table: "Modules",
                column: "ParentModuleId");

            migrationBuilder.AddForeignKey(
                name: "FK_Modules_Modules_ParentModuleId",
                table: "Modules",
                column: "ParentModuleId",
                principalTable: "Modules",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // The standard screens, so the super admin has something to tick rather than a blank
            // page and a guess at the routes. Inserted only when the href is not already taken,
            // which makes this safe to re-run and safe on a deployment that invented its own.
            //
            // Deliberately attached to no plan. Until one includes them, every sidebar falls
            // back to the built-in menu and nothing anyone sees today changes.
            migrationBuilder.Sql(@"
                INSERT INTO ""Modules"" (""Id"", ""Icon"", ""Title"", ""Description"", ""SortOrder"", ""IsPublished"", ""NavHref"", ""ParentModuleId"", ""OwnerOnly"", ""CreatedAt"")
                SELECT * FROM (VALUES
                    (gen_random_uuid(), 'Users',       'Clients',             'Le répertoire de vos clients, leurs contacts et leurs adresses.', 10, TRUE, '/clients',             NULL::uuid, FALSE, now()),
                    (gen_random_uuid(), 'FolderKanban','Projets',             'Les mandats en cours, leur échéancier et leur budget.',           20, TRUE, '/projets',             NULL::uuid, FALSE, now()),
                    (gen_random_uuid(), 'Receipt',     'Factures',            'La facturation, ses taxes et son suivi de paiement.',             30, TRUE, '/factures',            NULL::uuid, FALSE, now()),
                    (gen_random_uuid(), 'UsersRound',  'Ressources humaines', 'Les employés, les équipes, les lieux et les documents.',           40, TRUE, '/ressources-humaines', NULL::uuid, TRUE,  now()),
                    (gen_random_uuid(), 'Building2',   'Entreprise',          'La fiche de votre entreprise, telle que vos clients la voient.',   50, TRUE, '/entreprise',          NULL::uuid, TRUE,  now())
                ) AS seed(id, icon, title, description, sort_order, published, href, parent, owner_only, created_at)
                WHERE NOT EXISTS (SELECT 1 FROM ""Modules"" m WHERE m.""NavHref"" = seed.href);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Modules_Modules_ParentModuleId",
                table: "Modules");

            migrationBuilder.DropIndex(
                name: "IX_Modules_ParentModuleId",
                table: "Modules");

            migrationBuilder.DropColumn(
                name: "NavHref",
                table: "Modules");

            migrationBuilder.DropColumn(
                name: "OwnerOnly",
                table: "Modules");

            migrationBuilder.DropColumn(
                name: "ParentModuleId",
                table: "Modules");
        }
    }
}
