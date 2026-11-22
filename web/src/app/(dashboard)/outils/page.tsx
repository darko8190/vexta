"use client";

import { useState } from "react";
import { ClipboardPen, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { SectionPlaceholder } from "@/components/projects/detail/section-placeholder";

/**
 * Pattern 1 — List / Index, with the record type chosen from the rail, the same shape as
 * Inventaire.
 *
 * Both sections are in place and empty: the structure is what says what this page will hold, and
 * each one gets its records later the way the products got theirs. Nothing here pretends to store
 * anything yet, so there is no query and no count to wait for — the badges are honestly zero.
 */
export default function ToolsPage() {
  // Always the forms, and not remembered between visits: it is the first of the two and the one
  // filled in from the field, so opening anywhere else would mean reading the page before using it.
  const [section, setSection] = useState("formulaires");

  const sections: NavSection[] = [
    { key: "formulaires", label: "Formulaires", count: 0, icon: ClipboardPen },
    { key: "formations", label: "Formations", count: 0, icon: GraduationCap },
  ];

  return (
    <div>
      <PageHeader
        title="Outils & Formation"
        description="Les formulaires remplis sur le terrain et les formations de vos employés."
      />

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections des outils et de la formation"
        />

        <div className="min-w-0 flex-1">
          {section === "formulaires" && (
            <SectionPlaceholder
              icon={ClipboardPen}
              title="Formulaires"
              description="Les formulaires que vos employés remplissent sur le chantier."
            />
          )}
          {section === "formations" && (
            <SectionPlaceholder
              icon={GraduationCap}
              title="Formations"
              description="Les formations suivies par vos employés et celles qui restent à suivre."
            />
          )}
        </div>
      </div>
    </div>
  );
}
