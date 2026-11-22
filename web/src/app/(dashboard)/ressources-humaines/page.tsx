"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentsSection } from "@/components/hr/documents-section";
import { EmployeesSection } from "@/components/hr/employees-section";
import { HrPills, type HrPill } from "@/components/hr/hr-pills";
import { LocationsSection } from "@/components/hr/locations-section";
import { TeamsSection } from "@/components/hr/teams-section";
import { useHrCountsQuery } from "@/hooks/use-hr";

export default function HumanResourcesPage() {
  const { data: counts } = useHrCountsQuery();
  const [section, setSection] = useState("employes");

  // Zero until the counts land, rather than a skeleton per pill: the labels are what you aim
  // at, and having them jump into place is worse than a number arriving a moment later.
  const pills: HrPill[] = [
    { key: "employes", label: "Employés", count: counts?.employees ?? 0 },
    { key: "equipes", label: "Équipes", count: counts?.teams ?? 0 },
    { key: "adresses", label: "Adresses", count: counts?.locations ?? 0 },
    { key: "documents", label: "Documents", count: counts?.documents ?? 0 },
  ];

  return (
    <div>
      <PageHeader
        title="Ressources humaines"
        description="Vos employés, vos équipes, vos lieux et vos documents."
      />

      <HrPills pills={pills} active={section} onSelect={setSection} />

      {section === "employes" && <EmployeesSection />}
      {section === "equipes" && <TeamsSection />}
      {section === "adresses" && <LocationsSection />}
      {section === "documents" && <DocumentsSection />}
    </div>
  );
}
