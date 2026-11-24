"use client";

import Link from "next/link";
import { CreditCard, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { useMyInvoicesQuery } from "@/hooks/use-personal-profile";
import { invoiceStatusBadgeVariant, invoiceStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Every invoice this person has been sent, from every company that has one for them.
 *
 * Pattern: List / Index. The question somebody opens it with is "what do I still owe", so what
 * is owed sorts first and the payment link is on the row rather than a click away.
 *
 * Nothing here is editable. A customer reads their invoice; arguing with one goes to the
 * company, and paying one goes through the link the company's own Stripe account issued.
 */
export default function MyInvoicesPage() {
  const { data, isLoading, isError, error, refetch } = useMyInvoicesQuery();

  const invoices = data ?? [];
  const owed = invoices.reduce((total, invoice) => total + invoice.outstanding, 0);

  return (
    <div>
      <PageHeader
        title="Mes factures"
        description="Ce que les entreprises de Vexta vous ont facturé."
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : isError ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <EmptyState
              icon={FileText}
              title="Aucune facture"
              description="Les factures qu'une entreprise vous envoie depuis Vexta apparaissent ici, même si vous n'avez pas de compte chez elle."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {owed > 0 && (
            <p className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              À payer : <strong className="tabular-nums">{formatAmount(owed)}</strong>
            </p>
          )}

          <ul className="grid gap-2">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {invoice.number}
                    <span className="font-normal text-muted-foreground">
                      {" · "}
                      {invoice.companySlug ? (
                        <Link href={`/e/${invoice.companySlug}`} className="hover:underline">
                          {invoice.companyName}
                        </Link>
                      ) : (
                        invoice.companyName
                      )}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Émise le {formatDateOnly(invoice.issueDate)} · échéance{" "}
                    {formatDateOnly(invoice.dueDate)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-medium tabular-nums text-foreground">
                      {formatAmount(invoice.total, invoice.currency)}
                    </p>
                    {/* Said only when it differs from the total: on an untouched invoice the
                        two figures are the same number printed twice. */}
                    {invoice.outstanding > 0 && invoice.paid > 0 && (
                      <p className="text-xs tabular-nums text-muted-foreground">
                        reste {formatAmount(invoice.outstanding, invoice.currency)}
                      </p>
                    )}
                  </div>

                  <Badge variant={invoiceStatusBadgeVariant[invoice.status]}>
                    {invoiceStatusLabels[invoice.status]}
                  </Badge>

                  {invoice.payToken && (
                    <Link
                      href={`/facture/${invoice.payToken}`}
                      className={cn(buttonVariants({ size: "sm" }))}
                    >
                      <CreditCard className="size-4" />
                      Payer
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
