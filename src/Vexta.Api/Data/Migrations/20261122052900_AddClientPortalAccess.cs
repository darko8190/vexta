using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddClientPortalAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ClientId",
                table: "TenantMemberships",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "InvitationExpiresAt",
                table: "Clients",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "InvitationSentAt",
                table: "Clients",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvitationTokenHash",
                table: "Clients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Clients",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "InvitationExpiresAt",
                table: "ClientContacts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "InvitationSentAt",
                table: "ClientContacts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvitationTokenHash",
                table: "ClientContacts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "ClientContacts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantMemberships_ClientId",
                table: "TenantMemberships",
                column: "ClientId");

            migrationBuilder.CreateIndex(
                name: "IX_Clients_UserId",
                table: "Clients",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_ClientContacts_UserId",
                table: "ClientContacts",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_ClientContacts_AspNetUsers_UserId",
                table: "ClientContacts",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Clients_AspNetUsers_UserId",
                table: "Clients",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_TenantMemberships_Clients_ClientId",
                table: "TenantMemberships",
                column: "ClientId",
                principalTable: "Clients",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ClientContacts_AspNetUsers_UserId",
                table: "ClientContacts");

            migrationBuilder.DropForeignKey(
                name: "FK_Clients_AspNetUsers_UserId",
                table: "Clients");

            migrationBuilder.DropForeignKey(
                name: "FK_TenantMemberships_Clients_ClientId",
                table: "TenantMemberships");

            migrationBuilder.DropIndex(
                name: "IX_TenantMemberships_ClientId",
                table: "TenantMemberships");

            migrationBuilder.DropIndex(
                name: "IX_Clients_UserId",
                table: "Clients");

            migrationBuilder.DropIndex(
                name: "IX_ClientContacts_UserId",
                table: "ClientContacts");

            migrationBuilder.DropColumn(
                name: "ClientId",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "InvitationExpiresAt",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "InvitationSentAt",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "InvitationTokenHash",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "InvitationExpiresAt",
                table: "ClientContacts");

            migrationBuilder.DropColumn(
                name: "InvitationSentAt",
                table: "ClientContacts");

            migrationBuilder.DropColumn(
                name: "InvitationTokenHash",
                table: "ClientContacts");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "ClientContacts");
        }
    }
}
