"use client";

import { useState } from "react";
import { Building2, ClipboardList, PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { GoodsReceiptsSection } from "@/components/purchasing/goods-receipts-section";
import { PurchaseOrdersSection } from "@/components/purchasing/purchase-orders-section";
import { SuppliersSection } from "@/components/purchasing/suppliers-section";

/**
 * Pattern 1 — List / Index, with the record type chosen from the rail, the same shape as
 * Ressources humaines.
 *
 * The three are one tab because they are one cycle: you record a yard, you order from it, and
 * you note what the truck brought. Somebody doing any of the three is about to do another, and
 * three sidebar entries would make that a round trip through the menu every time.
 */
export default function SupplyPage() {
  // Always the suppliers, and not remembered between visits: nothing can be ordered before
  // somebody has been recorded to order from, so it is where the work starts.
  const [section, setSection] = useState("fournisseurs");

  const sections: NavSection[] = [
    { key: "fournisseurs", label: "Fournisseurs", icon: Building2 },
    { key: "commandes", label: "Commandes", icon: ClipboardList },
    { key: "receptions", label: "Réceptions", icon: PackageCheck },
  ];

  return (
    <div>
      <PageHeader
        title="Fournisseurs & Commandes"
        description="Chez qui vous achetez, ce que vous avez commandé, et ce qui est arrivé."
      />

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections des fournisseurs et commandes"
        />

        <div className="min-w-0 flex-1">
          {section === "fournisseurs" && <SuppliersSection />}
          {section === "commandes" && <PurchaseOrdersSection />}
          {section === "receptions" && <GoodsReceiptsSection />}
        </div>
      </div>
    </div>
  );
}
