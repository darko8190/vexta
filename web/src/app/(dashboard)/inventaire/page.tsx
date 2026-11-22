"use client";

import { useState } from "react";
import { Blocks, ClipboardList, Package, Warehouse, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { SectionPlaceholder } from "@/components/projects/detail/section-placeholder";

/**
 * Pattern 1 — List / Index, with the record type chosen from the rail.
 *
 * The five sections are in place and empty: the structure is what says what inventory will
 * hold, and each one gets its records the way Dépenses got its own. Nothing here pretends to
 * store anything yet.
 */
export default function InventoryPage() {
  const [section, setSection] = useState("produits");

  const sections: NavSection[] = [
    { key: "produits", label: "Produits", count: 0, icon: Package },
    { key: "equipements", label: "Équipements", count: 0, icon: Wrench },
    { key: "entrepot", label: "Entrepôt", count: 0, icon: Warehouse },
    { key: "assemblages", label: "Assemblages", count: 0, icon: Blocks },
    { key: "suivis", label: "Suivis d'inventaires", count: 0, icon: ClipboardList },
  ];

  return (
    <div>
      <PageHeader
        title="Inventaire"
        description="Vos produits, vos équipements et ce qui entre et sort de l'entrepôt."
      />

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections de l'inventaire"
        />

        <div className="min-w-0 flex-1">
          {section === "produits" && (
            <SectionPlaceholder
              icon={Package}
              title="Produits"
              description="Ce que vous gardez en stock et revendez."
            />
          )}
          {section === "equipements" && (
            <SectionPlaceholder
              icon={Wrench}
              title="Équipements"
              description="Vos outils et machines, et sur quel chantier ils sont."
            />
          )}
          {section === "entrepot" && (
            <SectionPlaceholder
              icon={Warehouse}
              title="Entrepôt"
              description="Où les choses sont rangées, et combien il en reste à chaque endroit."
            />
          )}
          {section === "assemblages" && (
            <SectionPlaceholder
              icon={Blocks}
              title="Assemblages"
              description="Les ensembles montés à partir de plusieurs produits."
            />
          )}
          {section === "suivis" && (
            <SectionPlaceholder
              icon={ClipboardList}
              title="Suivis d'inventaires"
              description="Les entrées, les sorties et les décomptes."
            />
          )}
        </div>
      </div>
    </div>
  );
}
