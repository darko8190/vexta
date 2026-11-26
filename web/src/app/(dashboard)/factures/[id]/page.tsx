"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FileText, FolderKanban, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { InvoicePaymentsSection } from "@/components/invoices/invoice-payments-section";
import { InvoiceCreditsSection } from "@/components/invoices/invoice-credits-section";
import { InvoiceRefundsSection } from "@/components/invoices/invoice-refunds-section";
import { PdfViewer } from "@/components/layout/pdf-viewer";
import { InvoiceSendDialog } from "@/components/invoices/invoice-send-dialog";
import { SendHistoryCard } from "@/components/layout/send-history-card";
import { InvoiceRecurrenceCard } from "@/components/invoices/invoice-recurrence-card";
import { useIsClientUser } from "@/hooks/use-can-create";
import { useDeleteInvoice, useInvoiceQuery } from "@/hooks/use-invoices";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { ApiError } from "@/lib/api";
import { invoiceLineKindLabels, invoiceStatusBadgeVariant, invoiceStatusLabels } from "@/lib/labels";
import { formatDateOnly } from "@/lib/dates";
import { formatProjectNumber } from "@/lib/types";
import { cn } from "@/lib/utils";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(amount);
}

/** A line's quantity, which may be 12 or 12,5 and should not be printed as 12,00. */
const quantityFormat = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 3 });

/**
 * One invoice, as the document it is.
 *
 * Read top to bottom the way the paper is: what this document is, then what is on it, with the
 * document itself alongside. The record used to open straight into its edit form, which meant a
 * customer could list their invoices and never read one; editing is a step away, for the people
 * allowed to take it.
 */
export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isClient = useIsClientUser();
  const { data: invoice, isLoading, isError } = useInvoiceQuery(id);
  const deleteInvoice = useDeleteInvoice();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sending, setSending] = useState(false);

  const pdf = usePdfDocument(invoice ? `invoices/${id}/pdf` : null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-[40rem] w-full" />
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

      {/* The document's identity card, above everything: its number, who it is for, where it
          stands and what it comes to. Everything below is detail. */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{invoice.number}</span>
              <Badge variant={invoiceStatusBadgeVariant[invoice.status]}>
                {invoiceStatusLabels[invoice.status]}
              </Badge>
              {invoice.isTaxExempt && <Badge variant="secondary">Sans taxes</Badge>}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {invoice.clientName}
            </h1>
          </div>

          {invoice.projectId && (
            <Link
              href={`/projets/${invoice.projectId}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), isClient ? "" : "order-first sm:order-none")}
            >
              <FolderKanban />
              Voir le projet
            </Link>
          )}

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
              {/* A cancelled invoice is not sent again: the status is the record someone
                  checks before chasing a payment. */}
              {invoice.status !== "Annulee" && (
                <Button variant="outline" size="sm" onClick={() => setSending(true)}>
                  <Send />
                  {invoice.sentAt ? "Renvoyer" : "Envoyer"}
                </Button>
              )}
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
            <dd className="text-foreground">{formatDateOnly(invoice.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Échéance</dt>
            <dd className="text-foreground">{formatDateOnly(invoice.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Projet</dt>
            <dd className="mt-0.5 text-foreground">
              {invoice.projectId && invoice.projectNumber ? (
                /* The job this document bills, one click away. Whoever opens an invoice with a
                   question about it has the question about the chantier, not about the paper.
                   A styled anchor rather than a Button: this is navigation. */
                <Link
                  href={`/projets/${invoice.projectId}`}
                  aria-label={`Ouvrir le projet ${formatProjectNumber(invoice.projectNumber)}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  {formatProjectNumber(invoice.projectNumber)}
                  <ArrowUpRight />
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Politique de prix</dt>
            <dd className="text-foreground">{invoice.pricePolicyName ?? "—"}</dd>
          </div>
          {invoice.sentAt && (
            <div>
              <dt className="text-muted-foreground">Envoyée le</dt>
              <dd className="text-foreground">{formatDateOnly(invoice.sentAt)}</dd>
            </div>
          )}
          {invoice.reminderSentAt && (
            <div>
              <dt className="text-muted-foreground">
                {(invoice.reminderCount ?? 0) > 1
                  ? `Relancée automatiquement ${invoice.reminderCount} fois, la dernière le`
                  : "Relancée automatiquement le"}
              </dt>
              <dd className="text-foreground">{formatDateOnly(invoice.reminderSentAt)}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium text-foreground">{money(invoice.total, invoice.currency)}</dd>
          </div>
        </dl>

        {invoice.notes && (
          <div className="mt-4 border-t border-border pt-4 text-sm">
            <p className="text-muted-foreground">Notes</p>
            <p className="whitespace-pre-line text-foreground">{invoice.notes}</p>
          </div>
        )}
      </div>

      {/* The preview moves beside the lines only at 2xl, the same width the invoice form
          switches at: a 30rem document next to a table of amounts clips one of the two, and a
          total nobody can read is worse than a document further down the page. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(34rem,46%)]">
        {/* One grid child, two stacked panels. Placing the payments with col-start would leave
            the preview to auto-place itself beside them instead of beside the lines. */}
        <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lignes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">Prix unitaire</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium text-foreground">{line.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoiceLineKindLabels[line.kind]}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {quantityFormat.format(line.quantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(line.unitPrice, invoice.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(line.quantity * line.unitPrice, invoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-muted-foreground">
                    Sous-total
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(invoice.subtotal, invoice.currency)}
                  </TableCell>
                </TableRow>
                {/* The two taxes stay named and separate, as they are on the document: one
                    "taxes" figure is the one a company gets asked to break down. */}
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-muted-foreground">
                    {invoice.tax1Label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(invoice.tax1, invoice.currency)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-muted-foreground">
                    {invoice.tax2Label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(invoice.tax2, invoice.currency)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-medium text-foreground">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {money(invoice.total, invoice.currency)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* Staff only: a client does not schedule their own bills. */}
        {!isClient && invoice.status !== "Annulee" && (
          <InvoiceRecurrenceCard invoiceId={invoice.id} invoiceNumber={invoice.number} />
        )}

        {!isClient && <SendHistoryCard type="facture" id={invoice.id} />}

        {/* Under the lines, in the same column: the money that came in belongs beside the
            money that was asked for, and a customer reading their own invoice sees what they
            have paid on it. A draft has nothing to pay yet — the API refuses it and says why,
            so the panel would only offer a button that fails. */}
        {invoice.status !== "Brouillon" && (
          <>
            <InvoicePaymentsSection invoiceId={invoice.id} />
            {/* Under the payments and not beside them: giving money back is something that
                happens to a payment, and reading it the other way round makes no sense. */}
            <InvoiceRefundsSection invoiceId={invoice.id} />
            {/* Last, because it is what squares the paperwork once the money has moved. */}
            <InvoiceCreditsSection invoiceId={invoice.id} cancelled={invoice.status === "Annulee"} />
          </>
        )}
        </div>

        {/* Beside the lines on a wide screen, under them otherwise. Sticky so the document
            stays in view while a long list of lines is being read. */}
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <PdfViewer
            url={pdf.url}
            loading={pdf.loading}
            error={pdf.error}
            title={`Facture ${invoice.number}`}
            fileName={`Facture-${invoice.number}.pdf`}
          />
        </aside>
      </div>

      {!isClient && (
        <InvoiceSendDialog open={sending} onOpenChange={setSending} invoice={invoice} />
      )}

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer cette facture ?"
        description={`La facture ${invoice.number} ira à la corbeille (Paramètres). Vous pourrez la restaurer.`}
        onConfirm={onDelete}
        pending={deleteInvoice.isPending}
      />
    </div>
  );
}
