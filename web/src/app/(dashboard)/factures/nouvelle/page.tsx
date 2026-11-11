import { PageHeader } from "@/components/layout/page-header";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export default function NewInvoicePage() {
  return (
    <div>
      <PageHeader title="Nouvelle facture" description="Remplissez les informations et les lignes de facturation." />
      <InvoiceForm />
    </div>
  );
}
