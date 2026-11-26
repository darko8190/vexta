"use client";

import { useState } from "react";
import { matchesSearch } from "@/lib/text-match";
import { SearchInput } from "@/components/layout/search-input";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useInvoicesQuery } from "@/hooks/use-invoices";
import { formatDateOnly } from "@/lib/dates";
import { invoiceStatusLabels } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/** What has been billed on this project. Last in the rail, because it is the outcome. */
export function ProjectInvoicesSection({
  projectId,
  clientId,
}: {
  projectId: string;
  /** Needed on the link: the project picker on the form is scoped to a client. */
  clientId: string;
}) {
  // A failed read is not a project nobody billed, and here the two look identical: `data` is
  // undefined on failure, so `items.length === 0` would announce "aucune facture" on a project
  // that has been invoiced — the one sentence nobody should read about money they are owed.
  // And `isError` alone is too wide: a failed background refetch keeps it true over rows
  // that are still right, so the panel only wins with nothing read at all (`!data`) or rows
  // left over from another query key (`isPlaceholderData`).
  const {
    data,
    isLoading,
    isError,
    isPlaceholderData,
    error: loadError,
    refetch,
  } = useInvoicesQuery(1, "", undefined, undefined, projectId);
  const [search, setSearch] = useState("");
  const invoices = (data?.items ?? []).filter((invoice) =>
    matchesSearch(search, invoice.number, invoice.clientName, invoice.status),
  );

  // A styled link rather than a Button rendering one: Base UI drops native button semantics
  // when its render target is not a <button>, and this is a navigation.
  const createLink = (
    <Link
      href={`/factures/nouvelle?clientId=${clientId}&projectId=${projectId}`}
      className={cn(buttonVariants())}
    >
      <Plus />
      Nouvelle facture
    </Link>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Factures</h2>
          <p className="text-sm text-muted-foreground">Ce qui a été facturé sur ce projet.</p>
        </div>
        {createLink}
      </div>

      {(data?.items.length ?? 0) > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une facture…" />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Factures indisponibles"
          fallback="Les factures de ce projet n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucune facture"
          description="Les factures émises pour ce projet apparaîtront ici."
          action={createLink}
        />
      ) : (
        <ul className="space-y-2">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              {/* The whole row is the link: on a phone the number alone is a poor target. */}
              <Link
                href={`/factures/${invoice.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-foreground">{invoice.number}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateOnly(invoice.issueDate)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {invoice.isTaxExempt && <Badge variant="outline">Non taxable</Badge>}
                  <span className="tabular-nums text-foreground">
                    {formatCents(Math.round(invoice.total * 100), invoice.currency)}
                  </span>
                  <Badge variant="secondary">{invoiceStatusLabels[invoice.status]}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
