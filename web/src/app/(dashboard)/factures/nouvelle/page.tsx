import { PageHeader } from "@/components/layout/page-header";
import { InvoiceForm } from "@/components/invoices/invoice-form";

/**
 * Opened from the menu, or from a project with that project already filled in — which is where
 * most invoices start, and it carries the project's tax answer with it.
 */
export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; projectId?: string }>;
}) {
  const { clientId, projectId } = await searchParams;

  return (
    <div>
      <PageHeader title="Nouvelle facture" description="Remplissez les informations et les lignes de facturation." />
      <InvoiceForm defaultClientId={clientId} defaultProjectId={projectId} />
    </div>
  );
}
