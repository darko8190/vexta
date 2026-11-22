"use client";

import { use } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { Spinner } from "@/components/ui/spinner";
import { useInvoiceQuery } from "@/hooks/use-invoices";

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: invoice, isLoading } = useInvoiceQuery(id);

  return (
    <div>
      <PageHeader
        title={invoice ? `Modifier la facture ${invoice.number}` : "Modifier la facture"}
        description="Les changements apparaissent dans le document à droite."
      />
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6" />
        </div>
      ) : (
        invoice && <InvoiceForm invoice={invoice} />
      )}
    </div>
  );
}
