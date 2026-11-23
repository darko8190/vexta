"use client";

import { ClipboardPen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionPlaceholder } from "@/components/projects/detail/section-placeholder";

/**
 * Soumissions: the prices given to clients, before any work is done.
 *
 * A tab of its own rather than a status on an invoice. A quote and an invoice look alike on
 * paper and are nothing alike in the books: a quote is an offer that can be refused, and
 * holding them in the invoice table would put documents nobody owes anything on into every
 * figure that adds up what the company is owed.
 *
 * The screen behind it is not built. It is in the menu because that is where somebody will look
 * for it, and an honest empty page is better than a quote written as a draft invoice — which is
 * the workaround that cannot be undone once a month has been closed on it.
 */
export default function QuotesPage() {
  return (
    <div>
      <PageHeader
        title="Soumissions"
        description="Les prix donnés aux clients, et ce qu'ils sont devenus."
      />
      <SectionPlaceholder
        icon={ClipboardPen}
        title="Soumissions"
        description="Un prix donné avant les travaux : accepté, il devient le projet et la facture. En attendant, une soumission se prépare comme une facture en brouillon."
      />
    </div>
  );
}
