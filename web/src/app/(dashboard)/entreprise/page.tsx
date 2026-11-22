"use client";

import { useState } from "react";
import { Building2, Globe } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { CompanyInfoSection } from "@/components/company/company-info-section";
import { PublicPageSection } from "@/components/company/public-page-section";
import { useCompanyProfileQuery } from "@/hooks/use-company";
import { useJobPostingsQuery } from "@/hooks/use-public-page";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function CompanyPage() {
  const { user } = useAuth();
  const { data: profile, isLoading, error } = useCompanyProfileQuery();

  const canEdit = user?.role === "TenantAdmin" || user?.role === "SuperAdmin";

  // The badge, and nothing else from this list: the section itself asks again and already owns
  // the table. The query is shared, so this costs one request for the whole screen.
  const { data: jobs } = useJobPostingsQuery(canEdit);
  const publishedJobs = jobs?.filter((job) => job.isPublished).length ?? 0;

  // Always the company's own details, and not remembered between visits: this is the screen the
  // card is read from, and landing on whichever section was open last month means reading the
  // page before you can use it.
  const [section, setSection] = useState("informations");

  const sections: NavSection[] = [
    { key: "informations", label: "Informations", icon: Building2 },
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
