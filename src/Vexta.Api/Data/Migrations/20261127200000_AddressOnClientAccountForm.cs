using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vexta.Api.Data.Migrations
{
    /// <summary>
    /// Adds the address questions to every « Création d'un compte client » form that was made
    /// before they existed, right after the telephone, so the client it creates gets its address.
    /// Data only: the schema does not change. A form that already has an address question is left
    /// alone.
    /// </summary>
    [DbContext(typeof(VextaDbContext))]
    [Migration("20261127200000_AddressOnClientAccountForm")]
    public partial class AddressOnClientAccountForm : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                DECLARE
                    f RECORD;
                    after_phone integer;
                    provinces text := E'Alberta\nColombie-Britannique\nÎle-du-Prince-Édouard\nManitoba\nNouveau-Brunswick\nNouvelle-Écosse\nNunavut\nOntario\nQuébec\nSaskatchewan\nTerre-Neuve-et-Labrador\nTerritoires du Nord-Ouest\nYukon';
                BEGIN
                    FOR f IN
                        SELECT t."Id", t."TenantId" FROM "FormTemplates" t
                        WHERE t."Title" = 'Création d''un compte client' AND t."Kind" = 2
                          AND NOT EXISTS (SELECT 1 FROM "FormFields" x
                                          WHERE x."FormTemplateId" = t."Id" AND x."Target" BETWEEN 15 AND 19)
                    LOOP
                        SELECT COALESCE(
                                 (SELECT MAX("SortOrder") FROM "FormFields" WHERE "FormTemplateId" = f."Id" AND "Target" = 5),
                                 (SELECT MAX("SortOrder") FROM "FormFields" WHERE "FormTemplateId" = f."Id"),
                                 -1) + 1
                          INTO after_phone;

                        UPDATE "FormFields" SET "SortOrder" = "SortOrder" + 5
                        WHERE "FormTemplateId" = f."Id" AND "SortOrder" >= after_phone;

                        INSERT INTO "FormFields" ("Id", "TenantId", "FormTemplateId", "Label", "HelpText", "Type", "IsRequired", "Options", "Target", "SortOrder")
                        VALUES
                            (gen_random_uuid(), f."TenantId", f."Id", 'Adresse', 'Le numéro et la rue.', 0, true, NULL, 15, after_phone),
                            (gen_random_uuid(), f."TenantId", f."Id", 'Appartement ou bureau', NULL, 0, false, NULL, 16, after_phone + 1),
                            (gen_random_uuid(), f."TenantId", f."Id", 'Ville', NULL, 0, true, NULL, 17, after_phone + 2),
                            (gen_random_uuid(), f."TenantId", f."Id", 'Province', NULL, 4, true, provinces, 18, after_phone + 3),
                            (gen_random_uuid(), f."TenantId", f."Id", 'Code postal', NULL, 0, true, NULL, 19, after_phone + 4);
                    END LOOP;
                END $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The questions stay: answers already given to them would lose their question.
        }
    }
}
