"use client";

import { PageHeader } from "@/components/layout/page-header";
import { CvDocumentSection } from "@/components/personal/cv-document-section";
import { CvSection } from "@/components/personal/cv-section";
import { MyApplicationsSection } from "@/components/personal/my-applications-section";

/**
 * Somebody's own CV and the applications it has sent.
 *
 * Reachable from any account, not only a personal one. An employee of a contractor has a CV
 * too, and the whole reason it is kept on the person rather than in a company is that it
 * follows them out.
 */
export default function MyCvPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mon CV"
        description="Écrit une fois, envoyé à chaque entreprise à qui vous répondez."
      />

      {/* The fields on the left, the document they make on the right, side by side from xl. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,42%)]">
        <div className="min-w-0">
          <CvSection />
        </div>
        <aside className="xl:sticky xl:top-0 xl:self-start">
          <CvDocumentSection />
        </aside>
      </div>
      <MyApplicationsSection />
    </div>
  );
}
