"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyInfoSection } from "@/components/company/company-info-section";
import { LocationsSection } from "@/components/hr/locations-section";
import { GalleriesSection } from "@/components/company/galleries-section";
import { PageBuilderSection } from "@/components/company/page-builder-section";
import { PublicPageSection } from "@/components/company/public-page-section";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { useCompanyProfileQuery } from "@/hooks/use-company";
import { ApiError } from "@/lib/api";

/**
 * The company's own card, as the first section of Paramètres: what appears on its documents and
 * what somebody outside sees of it. One tab per part, like the other sections.
 */
export function CompanySettings({ canEdit }: { canEdit: boolean }) {
  const { data: profile, isLoading, error } = useCompanyProfileQuery();

  if (isLoading) return <Skeleton className="h-64 w-full max-w-2xl" />;

  if (!profile) {
    return (
      <Alert variant="destructive" className="max-w-lg">
        <AlertTitle>Fiche indisponible</AlertTitle>
        <AlertDescription>
          {error instanceof ApiError ? error.message : "Impossible de charger la fiche de l'entreprise."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <SettingsTabs
      tabs={[
        { value: "informations", label: "Informations", content: <CompanyInfoSection profile={profile} canEdit={canEdit} /> },
        { value: "lieux", label: "Lieux", content: <LocationsSection /> },
        {
          value: "page-publique",
          label: "Page publique",
          content: canEdit ? (
            <PublicPageSection />
          ) : (
            <Alert>
              <AlertTitle>Réservé au propriétaire</AlertTitle>
              <AlertDescription>
                Seul le propriétaire de l&apos;entreprise peut modifier la page publique.
              </AlertDescription>
            </Alert>
          ),
        },
        { value: "galeries", label: "Galeries", content: <GalleriesSection canEdit={canEdit} /> },
        { value: "constructeur", label: "Constructeur de page", content: <PageBuilderSection canEdit={canEdit} /> },
      ]}
    />
  );
}
