"use client";

import { useState } from "react";
import { Briefcase, FileText, GraduationCap, Home, LifeBuoy, Palmtree, UsersRound, Users, UserSearch } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { SectionPlaceholder } from "@/components/projects/detail/section-placeholder";
import { CandidatesSection } from "@/components/hr/candidates-section";
import { CredentialsSection } from "@/components/hr/credentials-section";
import { DocumentsSection } from "@/components/hr/documents-section";
import { EmergencyContactsSection } from "@/components/hr/emergency-contacts-section";
import { EmployeeAddressesSection } from "@/components/hr/employee-addresses-section";
import { EmployeesSection } from "@/components/hr/employees-section";
import { LeavesSection } from "@/components/hr/employee/leaves-section";
import { TeamsSection } from "@/components/hr/teams-section";
import { useHrSectionCountsQuery } from "@/hooks/use-employee-file";
import { useIsOwner } from "@/hooks/use-can-create";

/**
 * Everything about the people who work here.
 *
 * Adresses is their addresses, not the company's — the yard and the head office live on the
 * company's own card, where they belong. Formations moved here from Outils for the same reason:
 * a card that expires belongs beside the person it stops from working.
 */
export default function HumanResourcesPage() {
  const { data: counts } = useHrSectionCountsQuery();
  const isOwner = useIsOwner();

  // Always the employees, and not remembered between visits: this is the list the department is
  // worked from, and opening on whichever section was left behind last week means reading the
  // page before you can use it.
  const [section, setSection] = useState("employes");

  // Undefined rather than zero until the counts land: a badge that shows 0 and then jumps to 14
  // has told somebody something false on the way.
  const sections: NavSection[] = [
    { key: "employes", label: "Employés", count: counts?.employees, icon: Users },
    { key: "equipes", label: "Équipes", count: counts?.teams, icon: UsersRound },
    { key: "adresses", label: "Adresses", count: counts?.addresses, icon: Home },
    { key: "contacts", label: "Contacts", count: counts?.emergencyContacts, icon: LifeBuoy },
    // Before Candidats, because that is the order it happens in: a posting goes out, and
    // the applicants arrive against it.
    { key: "offres-emplois", label: "Offres d'emplois", count: 0, icon: Briefcase },
    { key: "candidats", label: "Candidats", count: counts?.candidates, icon: UserSearch },
    { key: "formations", label: "Formations", count: counts?.credentials, icon: GraduationCap },
    { key: "conges", label: "Congés", count: counts?.pendingLeaves, icon: Palmtree },
    { key: "documents", label: "Documents", count: counts?.documents, icon: FileText },
  ];

  return (
    <div>
      <PageHeader
        title="Ressources humaines"
        description="Vos employés, vos équipes, et tout ce qui se garde à leur dossier."
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
          {section === "adresses" && <EmployeeAddressesSection />}
          {section === "contacts" && <EmergencyContactsSection />}
          {section === "offres-emplois" && (
            <SectionPlaceholder
              icon={Briefcase}
              title="Offres d'emplois"
              description="Les postes affichés, et les candidatures reçues pour chacun."
            />
          )}
          {section === "candidats" && <CandidatesSection />}
          {section === "formations" && <CredentialsSection />}
          {section === "conges" && <LeavesSection canDecide={isOwner} />}
          {section === "documents" && <DocumentsSection />}
        </div>
      </div>
    </div>
  );
}
