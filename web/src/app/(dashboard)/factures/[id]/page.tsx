"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { InvoicePdfViewer } from "@/components/invoices/invoice-pdf-viewer";
import { useIsClientUser } from "@/hooks/use-can-create";
import { useDeleteInvoice, useInvoiceQuery } from "@/hooks/use-invoices";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { ApiError } from "@/lib/api";
import { invoiceStatusBadgeVariant, invoiceStatusLabels } from "@/lib/labels";
import { formatProjectNumber } from "@/lib/types";
import { cn } from "@/lib/utils";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(amount);
}

/**
 * One invoice, as the document it is.
 *
 * The record used to open straight into its edit form, which meant a customer could list their
 * invoices and never read one. What there is to see here is the PDF; editing is a step away,
 * for the people allowed to take it.
 */
export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isClient = useIsClientUser();
  const { data: invoice, isLoading, isError } = useInvoiceQuery(id);
  const deleteInvoice = useDeleteInvoice();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pdf = usePdfDocument(invoice ? `invoices/${id}/pdf` : null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[40rem] w-full max-w-3xl" />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <EmptyState
        icon={FileText}
        title="Facture introuvable"
        description="Cette facture n'existe plus, ou vous n'y avez pas accès."
        action={
          <Link href="/factures" className={cn(buttonVariants())}>
            Retour aux factures
          </Link>
        }
      />
    );
  }

  async function onDelete() {
    try {
      await deleteInvoice.mutateAsync(id);
      toast.success("Facture supprimée.");
      router.push("/factures");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette facture.");
    }
  }

  return (
    <div>
      <Link
        href="/factures"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Factures
      </Link>

      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{invoice.number}</span>
              <Badge variant={invoiceStatusBadgeVariant[invoice.status]}>
                {invoiceStatusLabels[invoice.status]}
              </Badge>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {invoice.clientName}
            </h1>
          </div>

          {!isClient && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Supprimer
              </Button>
              {/* An anchor, not a Button rendering one: Base UI warns that a button rendered
                  as something else loses what a button is. */}
              <Link
                href={`/factures/${id}/modifier`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Pencil />
                Modifier
              </Link>
            </div>
          )}
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Émise le</dt>
            <dd className="text-foreground">{invoice.issueDate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Échéance</dt>
            <dd className="text-foreground">{invoice.dueDate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Projet</dt>
            <dd className="text-foreground">
              {invoice.projectNumber ? formatProjectNumber(invoice.projectNumber) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium text-foreground">{money(invoice.total, invoice.currency)}</dd>
          </div>
        </dl>
      </div>

      <InvoicePdfViewer
        className="max-w-3xl"
        url={pdf.url}
        loading={pdf.loading}
        error={pdf.error}
        title={`Facture ${invoice.number}`}
        fileName={`Facture-${invoice.number}.pdf`}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer cette facture ?"
        description={`La facture ${invoice.number} sera supprimée définitivement.`}
        onConfirm={onDelete}
        pending={deleteInvoice.isPending}
      />
    </div>
  );
}
