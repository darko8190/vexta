"use client";

import { PageHeader } from "@/components/layout/page-header";
import { OrdersSection } from "@/components/orders/orders-section";

/**
 * Pattern 1 — List / Index.
 *
 * One job on this URL: see what customers have ordered and move it along. No rail, because
 * there is one kind of record here — an order — and a rail with a single entry is a rail that
 * takes up a column to say nothing.
 *
 * "Commandes en ligne" rather than "Commandes", because the menu already has Fournisseurs &
 * Commandes. Those are the company buying; these come the other way, and somebody who opened
 * the wrong one would not find out until they read the names on the rows.
 */
export default function OnlineOrdersPage() {
  return (
    <div>
      <PageHeader
        title="Commandes en ligne"
        description="Les commandes reçues par votre page publique, et les factures qui en sortent."
      />

      <OrdersSection />
    </div>
  );
}
