"use client";

import { useState } from "react";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useAllCreditsQuery } from "@/hooks/use-credits";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDateOnly } from "@/lib/dates";
import { formatAmount } from "@/lib/money";

/**
 * Pattern 1 — List / Index. Every credit note the company has issued, across every invoice.
 *
 * Read-only, like the payments and refunds beside it: a credit note is issued on the invoice it
 * reduces. The totals carry the two taxes apart because that is what a quarter's returns need.
 */
export function CreditsSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useAllCreditsQuery(
    page,
    debouncedSearch,
    { from: from || undefined, to: to || undefined },
  );

  const items = data?.page.items ?? [];
  const totals = data?.totals;
  const filtered = Boolean(debouncedSearch || from || to);

  /** Reset to the first page whenever the question changes: page 4 of a new filter is nowhere. */
  function change(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Notes de crédit</h2>
        <p className="text-sm text-muted-foreground">
          Ce que vos factures ne facturent plus, toutes factures confondues.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field className="sm:col-span-2 lg:col-span-1">
          <FieldLabel htmlFor="credit-search">Rechercher</FieldLabel>
          <SearchInput
            id="credit-search"
            className="sm:w-full"
            value={search}
            onChange={(value) => change(() => setSearch(value))}
            placeholder="Numéro, facture, client ou raison…"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="credit-from">Du</FieldLabel>
          <Input
            id="credit-from"
            type="date"
            value={from}
            onChange={(event) => change(() => setFrom(event.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="credit-to">Au</FieldLabel>
          <Input
            id="credit-to"
            type="date"
            value={to}
            onChange={(event) => change(() => setTo(event.target.value))}
          />
        </Field>
      </div>

      {totals && totals.count > 0 && (
        <dl className="mb-4 grid gap-4 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Notes de crédit</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{totals.count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Crédité</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">
              {formatAmount(totals.amount)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Dont TPS</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{formatAmount(totals.gst)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Dont TVQ</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{formatAmount(totals.qst)}</dd>
          </div>
        </dl>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={error}
          title="Notes de crédit indisponibles"
          fallback="Les notes de crédit n'ont pas pu être chargées."
          onRetry={() => void refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={filtered ? "Aucune note de crédit trouvée" : "Aucune note de crédit"}
          description={
            filtered
              ? "Essayez une autre période ou une autre recherche."
              : "Une note de crédit s'émet sur la facture qu'elle réduit. Elles apparaîtront toutes ici."
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead className="hidden sm:table-cell">Facture</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                  <TableHead className="hidden lg:table-cell">Raison</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((credit) => (
                  <TableRow key={credit.id}>
                    <TableCell>
                      <Link
                        href={`/factures/${credit.invoiceId}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {credit.number}
                      </Link>
                      {/* What the hidden columns carry, folded under the number on a phone. */}
                      <div className="truncate text-xs text-muted-foreground sm:hidden">
                        {credit.invoiceNumber} · {credit.clientName} · {formatDateOnly(credit.date)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                      {credit.invoiceNumber}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="truncate text-foreground">{credit.clientName}</span>
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                      {formatDateOnly(credit.date)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{credit.reason}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {formatAmount(credit.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar result={data?.page} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
