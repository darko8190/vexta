"use client";

import { useState } from "react";
import { CalendarClock, Fingerprint } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { SectionPlaceholder } from "@/components/projects/detail/section-placeholder";
import { WorkTimesheetsSection } from "@/components/work/timesheets-section";

/**
 * The company's hours: every sheet together, rather than one job at a time.
 *
 * Its own tab, beside "Mes feuilles de temps" rather than inside it, because the two answer to
 * different people. An employee files their own week; a foreman reads everybody's. Folding them
 * into one screen would mean either showing an employee the whole payroll or showing a foreman
 * only his own hours.
 *
 * Poinçons — punching in and out — is the other half of the tab's name and is not built. It is
 * named here because a company that punches in will look for it under this heading, and the
 * alternative is a tab that has to be renamed the day it arrives.
 */
export default function TimePage() {
  const [section, setSection] = useState("feuilles-de-temps");

  const sections: NavSection[] = [
    { key: "feuilles-de-temps", label: "Feuilles de temps", icon: CalendarClock },
    { key: "poincons", label: "Poinçons", icon: Fingerprint },
  ];

  return (
    <div>
      <PageHeader
        title="Feuilles de temps et poinçons"
        description="Les heures de toute l'équipe, semaine par semaine."
      />

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections des feuilles de temps"
        />

        <div className="min-w-0 flex-1">
          {section === "feuilles-de-temps" && <WorkTimesheetsSection />}
          {section === "poincons" && (
            <SectionPlaceholder
              icon={Fingerprint}
              title="Poinçons"
              description="Arrivées et départs pointés sur place, qui alimenteront la feuille de temps au lieu d'être saisis après coup."
            />
          )}
        </div>
      </div>
    </div>
  );
}
