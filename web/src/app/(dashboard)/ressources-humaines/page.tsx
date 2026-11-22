"use client";

import { useState } from "react";
import { FileText, MapPin, UsersRound, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { DocumentsSection } from "@/components/hr/documents-section";
import { EmployeesSection } from "@/components/hr/employees-section";
import { LocationsSection } from "@/components/hr/locations-section";
import { TeamsSection } from "@/components/hr/teams-section";
import { useHrCountsQuery } from "@/hooks/use-hr";

export default function HumanResourcesPage() {
  const { data: counts } = useHrCountsQuery();

  // Always the employees, and not remembered between visits: this is the list the department is
  // worked from, and opening on whichever section was left behind last week means reading the
  // page before you can use it.
  const [section, setSection] = useState("employes");

  // Zero until the counts land, rather than a skeleton per badge: the labels are what you aim
  // at, and having them jump into place is worse than a number arriving a moment later.
  const sections: NavSection[] = [
    { key: "employes", label: "Employés", count: counts?.employees ?? 0, icon: Users },
    { key: "equipes", label: "Équipes", count: counts?.teams ?? 0, icon: UsersRound },
    { key: "adresses", label: "Adresses", count: counts?.locations ?? 0, icon: MapPin },
    { key: "documents", label: "Documents", count: counts?.documents ?? 0, icon: FileText },
  ];

  return (
    <div>
      <PageHeader
        title="Ressources humaines"
        description="Vos employés, vos équipes, vos lieux et vos documents."
      />

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections des ressources humaines"
        />

        <div className="min-w-0 flex-1">
          {section === "employes" && <EmployeesSection />}
          {section === "equipes" && <TeamsSection />}
          {section === "adresses" && <LocationsSection />}
          {section === "documents" && <DocumentsSection />}
        </div>
      </div>
    </div>
  );
}
