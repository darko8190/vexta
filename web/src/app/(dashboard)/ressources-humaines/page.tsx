"use client";

import { useState } from "react";
import { Briefcase, FileText, GraduationCap, Home, LifeBuoy, Palmtree, UsersRound, Users, UserSearch } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { CandidatesSection } from "@/components/hr/candidates-section";
import { JobPostingsSection } from "@/components/hr/job-postings-section";
import { CredentialsSection } from "@/components/hr/credentials-section";
import { DocumentsSection } from "@/components/hr/documents-section";
import { EmergencyContactsSection } from "@/components/hr/emergency-contacts-section";
import { EmployeeAddressesSection } from "@/components/hr/employee-addresses-section";
import { EmployeesSection } from "@/components/hr/employees-section";
import { LeavesSection } from "@/components/hr/employee/leaves-section";
import { TeamsSection } from "@/components/hr/teams-section";
import { useHrSectionCountsQuery } from "@/hooks/use-employee-file";
import { useJobPostingsQuery } from "@/hooks/use-job-postings";
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

  // The badge counts the positions actually being hired for, not every posting ever written: a
  // rail that said 14 because the company has advertised fourteen times since 2019 would be
  // counting its own history at somebody who wants to know what is open today.
  const { data: postings } = useJobPostingsQuery();
  const openPostings = postings?.filter((posting) => posting.status === "Publiee").length;

  // Always the employees, and not remembered between visits: this is the list the department is
  // worked from, and opening on whichever section was left behind last week means reading the
  // page before you can use it.
  const [section, setSection] = useState("employes");

  // Set when somebody follows a posting's application count. Held here rather than inside the
  // candidates list because it is the rail that moves: the number is in one section and the
  // people are in another.
  const [postingFilter, setPostingFilter] = useState<{ id: string; title: string } | undefined>(
    undefined,
  );

  // Undefined rather than zero until the counts land: a badge that shows 0 and then jumps to 14
  // has told somebody something false on the way.
  const sections: NavSection[] = [
    { key: "employes", label: "Employés", count: counts?.employees, icon: Users },
    { key: "equipes", label: "Équipes", count: counts?.teams, icon: UsersRound },
    { key: "adresses", label: "Adresses", count: counts?.addresses, icon: Home },
    { key: "contacts", label: "Contacts", count: counts?.emergencyContacts, icon: LifeBuoy },
    // Before Candidats, because that is the order it happens in: a posting goes out, and
    // the applicants arrive against it.
    { key: "offres-emplois", label: "Offres d'emplois", count: openPostings, icon: Briefcase },
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
            <JobPostingsSection
              onShowCandidates={(job) => {
                setPostingFilter({ id: job.id, title: job.title });
                setSection("candidats");
              }}
            />
          )}
          {section === "candidats" && (
            <CandidatesSection
              jobPosting={postingFilter}
              onClearJobPosting={() => setPostingFilter(undefined)}
            />
          )}
          {section === "formations" && <CredentialsSection />}
          {section === "conges" && <LeavesSection canDecide={isOwner} />}
          {section === "documents" && <DocumentsSection />}
        </div>
      </div>
    </div>
  );
}
