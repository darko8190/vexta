"use client";

import { useState } from "react";
import { Blocks, ClipboardList, Package, PackageCheck, ShoppingCart, Warehouse, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { ProductsSection } from "@/components/products/products-section";
import { SectionPlaceholder } from "@/components/projects/detail/section-placeholder";
import { useProductCountQuery } from "@/hooks/use-products";

/**
 * Pattern 1 — List / Index, with the record type chosen from the rail.
 *
 * Produits holds real records; the other four are in place and empty, because the structure is
 * what says what inventory will hold and each one gets its records the way this one got its.
 * Nothing in them pretends to store anything yet.
 */
export default function InventoryPage() {
  const [section, setSection] = useState("produits");
  const { data: productCount } = useProductCountQuery();

  const sections: NavSection[] = [
    { key: "produits", label: "Produits", count: productCount ?? 0, icon: Package },
    { key: "equipements", label: "Équipements", count: 0, icon: Wrench },
    { key: "entrepot", label: "Entrepôt", count: 0, icon: Warehouse },
    { key: "assemblages", label: "Assemblages", count: 0, icon: Blocks },
    { key: "suivis", label: "Suivis d'inventaires", count: 0, icon: ClipboardList },
    // The two histories sit last and in this order on purpose: an order is placed before
    // the delivery that answers it, so reading down the rail follows what happened.
    { key: "historique-commandes", label: "Historique de commandes", count: 0, icon: ShoppingCart },
    { key: "historique-receptions", label: "Historique de réceptions", count: 0, icon: PackageCheck },
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
          {section === "produits" && <ProductsSection />}
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
          {section === "historique-commandes" && (
            <SectionPlaceholder
              icon={ShoppingCart}
              title="Historique de commandes"
              description="Chaque ligne commandée, toutes commandes confondues : le produit, la quantité et la commande dont elle vient."
            />
          )}
          {section === "historique-receptions" && (
            <SectionPlaceholder
              icon={PackageCheck}
              title="Historique de réceptions"
              description="Chaque ligne reçue, toutes réceptions confondues : ce qui est entré, quand, et sur quelle commande."
            />
          )}
        </div>
      </div>
    </div>
  );
}
