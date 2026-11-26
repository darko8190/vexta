"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { useMyInvoiceQuery } from "@/hooks/use-personal-profile";
import { invoiceStatusBadgeVariant, invoiceStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * One invoice, read in full from the person's own space: who it is from, what it is for, what
 * is left. Paying goes through the company's Stripe account, when it has one.
 *
 * Pattern: Detail / Record.
 */
export default function MyInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: invoice, isLoading, isError } = useMyInvoiceQuery(id);

  const back = (
    <Link
      href="/mes-factures"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Mes factures
    </Link>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div>
        {back}
        <EmptyState icon={FileText} title="Facture introuvable" description="Cette facture n'existe plus, ou elle ne vous est pas adressée." />
      </div>
    );
  }

  const money = (value: number) => formatAmount(value, invoice.currency);

  return (
    <div className="max-w-4xl">
      {back}

      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{invoice.number}</span>
              <Badge variant={invoiceStatusBadgeVariant[invoice.status]}>{invoiceStatusLabels[invoice.status]}</Badge>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{invoice.companyName}</h1>
            <p className="text-sm text-muted-foreground">Adressée à {invoice.clientName}</p>
          </div>

          {invoice.payToken && (
            <Link href={`/facture/${invoice.payToken}`} className={cn(buttonVariants())}>
              <CreditCard />
              Payer {money(invoice.outstanding)}
            </Link>
          )}
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Émise le</dt>
            <dd className="text-foreground">{formatDateOnly(invoice.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Échéance</dt>
            <dd className="text-foreground">{formatDateOnly(invoice.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Payé</dt>
            <dd className="tabular-nums text-foreground">{money(invoice.paid)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reste à payer</dt>
            <dd className={cn("font-medium tabular-nums", invoice.outstanding > 0 ? "text-foreground" : "text-muted-foreground")}>
              {money(invoice.outstanding)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="w-24 text-right">Qté</TableHead>
              <TableHead className="w-32 text-right">Prix</TableHead>
              <TableHead className="w-32 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lines.map((line, index) => (
              <TableRow key={index}>
                <TableCell className="whitespace-normal">{line.description}</TableCell>
                <TableCell className="text-right tabular-nums">{line.quantity.toLocaleString("fr-CA")}</TableCell>
                <TableCell className="text-right tabular-nums">{money(line.unitPrice)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(line.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="text-right text-muted-foreground">Sous-total</TableCell>
              <TableCell className="text-right tabular-nums">{money(invoice.subtotal)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={3} className="text-right text-muted-foreground">TPS</TableCell>
              <TableCell className="text-right tabular-nums">{money(invoice.gst)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={3} className="text-right text-muted-foreground">TVQ</TableCell>
              <TableCell className="text-right tabular-nums">{money(invoice.qst)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{money(invoice.total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {invoice.notes && (
        <p className="mt-4 whitespace-pre-line rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {invoice.notes}
        </p>
      )}
    </div>
  );
}
