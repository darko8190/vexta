"use client";

import { useState } from "react";
import { CalendarRange, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { ScheduleSection } from "@/components/hr/employee/schedule-section";
import { WorkTasksSection } from "@/components/work/tasks-section";
import { useIsOwner } from "@/hooks/use-can-create";

/**
 * What is planned, and what is left to do.
 *
 * The two sit together because they are read together: a foreman deciding who goes where
 * tomorrow is reading the week's schedule and the open tasks in the same breath. They are kept
 * as separate records — a shift is written beforehand by whoever runs the crew, a task is a
 * piece of work on a job — because folding them into one table would mean a plan that quietly
 * becomes a work record when nobody corrects it.
 *
 * Horaire opens first: it is the one with a date on it.
 */
export default function TasksAndSchedulePage() {
  const isOwner = useIsOwner();
  const [section, setSection] = useState("horaire");

  const sections: NavSection[] = [
    { key: "horaire", label: "Horaire", icon: CalendarRange },
    { key: "taches", label: "Tâches", icon: ListChecks },
  ];

  return (
    <div>
      <PageHeader
        title="Tâches et horaire"
        description="Qui est attendu où, et ce qu'il reste à faire sur les chantiers."
      />

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections des tâches et de l'horaire"
        />

        <div className="min-w-0 flex-1">
          {/* No employeeId: the whole crew's week. The same component draws one person's week on
              their own file, which is what keeps the two from drifting apart.

              Writing a shift is the owner's: an employee who could schedule themselves could
              schedule themselves out of a Saturday. */}
          {section === "horaire" && <ScheduleSection canEdit={isOwner} />}
          {section === "taches" && <WorkTasksSection />}
        </div>
      </div>
    </div>
  );
}
