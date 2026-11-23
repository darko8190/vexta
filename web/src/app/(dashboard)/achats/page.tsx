"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { ExpensesSection } from "@/components/purchasing/expenses-section";

/**
 * Money already spent.
 *
 * One section today, and the rail is here anyway. It is the same reason a half-built record
 * shows its empty sections: the rail is the plan, and a page that grows a rail later moves
 * everything somebody had learned the position of.
 */
export default function PurchasingPage() {
  const [section, setSection] = useState("depenses");

  const sections: NavSection[] = [{ key: "depenses", label: "Dépenses", icon: Receipt }];

  return (
    <div>
      <PageHeader
        title="Achats"
        description="Ce qui est sorti : les dépenses de chantier, et ce qui viendra s'ajouter."
      />

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections des achats"
        />

        <div className="min-w-0 flex-1">{section === "depenses" && <ExpensesSection />}</div>
      </div>
    </div>
  );
}
