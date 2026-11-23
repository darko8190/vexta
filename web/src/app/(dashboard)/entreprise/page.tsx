"use client";

import { useState } from "react";
import { Building2, Globe, MapPin } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { CompanyInfoSection } from "@/components/company/company-info-section";
import { LocationsSection } from "@/components/hr/locations-section";
import { PublicPageSection } from "@/components/company/public-page-section";
import { useCompanyProfileQuery } from "@/hooks/use-company";
import { useLocationsQuery } from "@/hooks/use-hr";
import { useJobPostingsQuery } from "@/hooks/use-job-postings";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function CompanyPage() {
  const { user } = useAuth();
  const { data: profile, isLoading, error } = useCompanyProfileQuery();

  const canEdit = user?.role === "TenantAdmin" || user?.role === "SuperAdmin";

  // The badge only. The postings themselves are managed in Ressources humaines, which is also
  // where the applications are; this counts what is currently on the shop window.
  const { data: jobs } = useJobPostingsQuery(undefined, canEdit);
  const publishedJobs = jobs?.filter((job) => job.isPublished).length ?? 0;

  // The company's own places — head office, yard, warehouse. They used to sit under Ressources
  // humaines, where Adresses now means where the employees live; a warehouse is not a fact
  // about a person, and the two lists were only ever next to each other by accident.
  const { data: locations } = useLocationsQuery();

  // Always the company's own details, and not remembered between visits: this is the screen the
  // card is read from, and landing on whichever section was open last month means reading the
  // page before you can use it.
  const [section, setSection] = useState("informations");

  const sections: NavSection[] = [
    { key: "informations", label: "Informations", icon: Building2 },
    { key: "lieux", label: "Lieux", count: locations?.length, icon: MapPin },
    { key: "page-publique", label: "Page publique", count: canEdit ? publishedJobs : undefined, icon: Globe },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  // A failed query leaves isLoading false and the data undefined, so testing both together
  // showed the skeleton for ever — the page looked like it was still loading when in fact it had
  // already given up. Whatever went wrong, say so and offer the way out.
  if (!profile) {
    return (
      <div>
        <PageHeader title="Fiche entreprise" description="Ce que vos clients voient de vous." />
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>Fiche indisponible</AlertTitle>
          <AlertDescription>
            {error instanceof ApiError ? error.message : "Impossible de charger la fiche de l'entreprise."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Fiche entreprise"
        description="Ce qui apparaît sur vos documents, et ce qu'une personne de l'extérieur voit de vous."
      />

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections de la fiche entreprise"
        />

        <div className="min-w-0 flex-1">
          {section === "informations" && <CompanyInfoSection profile={profile} canEdit={canEdit} />}
          {section === "lieux" && <LocationsSection />}
          {section === "page-publique" &&
            (canEdit ? (
              <PublicPageSection />
            ) : (
              <Alert>
                <AlertTitle>Réservé au propriétaire</AlertTitle>
                <AlertDescription>
                  Seul le propriétaire de l&apos;entreprise peut modifier la page publique.
                </AlertDescription>
              </Alert>
            ))}
        </div>
      </div>
    </div>
  );
}
