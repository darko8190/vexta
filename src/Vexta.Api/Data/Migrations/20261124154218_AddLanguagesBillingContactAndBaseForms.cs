using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLanguagesBillingContactAndBaseForms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "BaseFormsCreatedAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SpokenLanguages",
                table: "PersonalProfiles",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WrittenLanguages",
                table: "PersonalProfiles",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresIdentification",
                table: "FormTemplates",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "BillingContactId",
                table: "Clients",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Clients_BillingContactId",
                table: "Clients",
                column: "BillingContactId");

            migrationBuilder.AddForeignKey(
                name: "FK_Clients_ClientContacts_BillingContactId",
                table: "Clients",
                column: "BillingContactId",
                principalTable: "ClientContacts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Clients_ClientContacts_BillingContactId",
                table: "Clients");

            migrationBuilder.DropIndex(
                name: "IX_Clients_BillingContactId",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "BaseFormsCreatedAt",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SpokenLanguages",
                table: "PersonalProfiles");

            migrationBuilder.DropColumn(
                name: "WrittenLanguages",
                table: "PersonalProfiles");

            migrationBuilder.DropColumn(
                name: "RequiresIdentification",
                table: "FormTemplates");

            migrationBuilder.DropColumn(
                name: "BillingContactId",
                table: "Clients");
        }
    }
}
