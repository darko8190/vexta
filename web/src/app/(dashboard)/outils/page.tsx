"use client";

import { useState } from "react";
import { ClipboardPen, Inbox } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { FormResponsesSection } from "@/components/forms/form-responses-section";
import { FormsSection } from "@/components/forms/forms-section";
import { useFormResponsesQuery, useFormsQuery } from "@/hooks/use-forms";

/**
 * Pattern 1 — List / Index, with the record type chosen from the rail, the same shape as
 * Inventaire.
 *
 * Formations used to be the second section here and now lives in Ressources humaines, beside
 * the people whose cards expire. What is left is one tool and what comes back from it.
 */
export default function ToolsPage() {
  // Always the forms, and not remembered between visits: it is the one that gets built, and
  // opening on last week's section means reading the page before using it.
  const [section, setSection] = useState("formulaires");

  // Both only feed badges. The sections below run the same queries, and react-query hands them
  // the one cached answer rather than asking twice.
  const { data: forms } = useFormsQuery();
  const { data: responses } = useFormResponsesQuery();

  const sections: NavSection[] = [
    { key: "formulaires", label: "Formulaires", count: forms?.length ?? 0, icon: ClipboardPen },
    {
      key: "reponses",
      label: "Réponses",
      count: responses?.reduce((total, form) => total + form.submissionCount, 0) ?? 0,
      icon: Inbox,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Outils"
        description="Les formulaires que vous montez, et ce qui revient du terrain."
      />

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections des outils"
        />

        <div className="min-w-0 flex-1">
          {section === "formulaires" && <FormsSection />}
          {section === "reponses" && <FormResponsesSection />}
        </div>
      </div>
    </div>
  );
}
