"use client";

import { useState } from "react";
import { FolderKanban, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { OrdersSection } from "@/components/orders/orders-section";
import { ProjectsToAssignSection } from "@/components/projects/projects-to-assign-section";
import { useCanManage } from "@/hooks/use-can-create";

/**
 * What is waiting for the office: the orders customers placed, and the projects nobody has been
 * handed yet. The route kept its old name, /commandes, so hidden tabs and plans still match.
 */
export default function ToHandlePage() {
  const canManage = useCanManage();
  const [section, setSection] = useState("commandes");

  const sections: NavSection[] = [
    { key: "commandes", label: "Commandes clients", icon: ShoppingBag },
    ...(canManage ? [{ key: "projets-a-assigner", label: "Projets à assigner", icon: FolderKanban }] : []),
  ];

  return (
    <div>
      <PageHeader title="À traiter" description="Les commandes de vos clients et les projets qui attendent une équipe." />

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav sections={sections} active={section} onSelect={setSection} label="Sections à traiter" />
        <div className="min-w-0 flex-1">
          {section === "commandes" && <OrdersSection />}
          {section === "projets-a-assigner" && canManage && <ProjectsToAssignSection />}
        </div>
      </div>
    </div>
  );
}
