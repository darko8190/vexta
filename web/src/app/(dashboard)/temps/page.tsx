"use client";

import { useState } from "react";
import { CalendarDays, Fingerprint } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { useSectionCountsQuery } from "@/hooks/use-section-counts";
import { WorkTimesheetsSection } from "@/components/work/timesheets-section";
import { WorkDaysSection } from "@/components/work/work-days-section";

/**
 * The company's time, in its two kinds.
 *
 * Feuilles de temps de jour: each employee's day, started and ended by them — what payroll
 * reads. Poinçons: the hours put on projects and tasks — what the clients are billed. Side by
 * side because the office compares them, and apart because they answer different questions.
 */
export default function TimePage() {
  const [section, setSection] = useState("journees");
  const { data: counts } = useSectionCountsQuery();

  const sections: NavSection[] = [
    { key: "journees", label: "Feuilles de temps de jour", icon: CalendarDays },
    { key: "poincons", label: "Poinçons", count: counts?.timesheets ?? 0, icon: Fingerprint },
  ];

  return (
    <div>
      <PageHeader
        title="Feuilles de temps et poinçons"
        description="La journée de chaque employé, et les heures pointées sur les projets."
      />

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav sections={sections} active={section} onSelect={setSection} label="Sections du temps" />

        <div className="min-w-0 flex-1">
          {section === "journees" && <WorkDaysSection />}
          {section === "poincons" && <WorkTimesheetsSection />}
        </div>
      </div>
    </div>
  );
}
