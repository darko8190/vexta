"use client";

import { useState } from "react";
import { FileText, ReceiptText, Undo2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { useSectionCountsQuery } from "@/hooks/use-section-counts";
import { CreditsSection } from "@/components/invoices/credits-section";
import { InvoicesSection } from "@/components/invoices/invoices-section";
import { PaymentsSection } from "@/components/invoices/payments-section";
import { RefundsSection } from "@/components/invoices/refunds-section";
import { useIsClientUser } from "@/hooks/use-can-create";

/**
 * Facturation: the invoices, and what has been paid on them.
 *
 * One tab with a rail inside it rather than two entries in the sidebar. The two lists answer
 * halves of the same question — what was billed, and what came back — and somebody reconciling
 * a month moves between them constantly.
 *
 * A customer gets no rail at all. The payments list crosses every invoice the company has
 * issued, which is not theirs to see, and an entry that answers 403 is worse than no entry.
 */
export default function BillingPage() {
  const isClient = useIsClientUser();
  const [section, setSection] = useState("factures");
  // Staff only: a customer gets no rail, and the endpoint would refuse them.
  const { data: counts } = useSectionCountsQuery(!isClient);

  const sections: NavSection[] = [
    { key: "factures", label: "Factures", count: counts?.invoices ?? 0, icon: FileText },
    { key: "paiements", label: "Paiements", count: counts?.payments ?? 0, icon: Wallet },
    { key: "credits", label: "Crédits", count: counts?.credits ?? 0, icon: ReceiptText },
    { key: "remboursements", label: "Remboursements", count: counts?.refunds ?? 0, icon: Undo2 },
  ];

  if (isClient) {
    return (
      <div>
        <PageHeader title="Mes factures" description="Les factures qui vous sont adressées." />
        <InvoicesSection />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Facturation"
        description="Ce que vous avez facturé, et ce qui est rentré."
      />

      {/* The rail sits beside the content from md up and becomes a scrollable row below it. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav
          sections={sections}
          active={section}
          onSelect={setSection}
          label="Sections de la facturation"
        />

        <div className="min-w-0 flex-1">
          {section === "factures" && <InvoicesSection />}
          {section === "paiements" && <PaymentsSection />}
          {section === "credits" && <CreditsSection />}
          {section === "remboursements" && <RefundsSection />}
        </div>
      </div>
    </div>
  );
}
