"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAllRefundsQuery } from "@/hooks/use-refunds";
import { formatDateOnly } from "@/lib/dates";
import { paymentMethodLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types";

/** Base UI needs a value for every item, and "" is not one. */
const ALL_METHODS = "tous";

/** "Porté au compte" is never a refund: no money arrived, so none can go back. */
const methods = (Object.keys(paymentMethodLabels) as PaymentMethod[]).filter(
  (method) => method !== "PorteAuCompte",
);

/**
 * Pattern 1 — List / Index. Everything the company has given back, across every invoice.
 *
 * Read-only, like the payments beside it. A refund is given against the invoice it belongs to,
 * because that is where what can still be given back is worked out and where the card that took
 * the money is known; a form here could only be a second way to do the same thing.
 */
export function RefundsSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useAllRefundsQuery(
    page,
    debouncedSearch,
    {
      method: (method || undefined) as PaymentMethod | undefined,
      from: from || undefined,
      to: to || undefined,
    },
  );

  const items = data?.page.items ?? [];
  const totals = data?.totals;
  const filtered = Boolean(debouncedSearch || method || from || to);

  /** Reset to the first page whenever the question changes: page 4 of a new filter is nowhere. */
  function change(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Remboursements</h2>
        <p className="text-sm text-muted-foreground">
          Ce qui est ressorti, toutes factures confondues.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field className="sm:col-span-2 lg:col-span-1">
          <FieldLabel htmlFor="refund-search">Rechercher</FieldLabel>
          <SearchInput
            id="refund-search"
            className="sm:w-full"
            value={search}
            onChange={(value) => change(() => setSearch(value))}
            placeholder="Numéro, client ou référence…"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="refund-method">Mode</FieldLabel>
          <Select
            value={method || ALL_METHODS}
            onValueChange={(value) =>
              change(() => setMethod(!value || value === ALL_METHODS ? "" : value))
            }
          >
            <SelectTrigger id="refund-method" className="w-full">
              <SelectValue>
                {(value: string) =>
                  value === ALL_METHODS ? "Tous les modes" : paymentMethodLabels[value as PaymentMethod]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_METHODS}>Tous les modes</SelectItem>
              {methods.map((value) => (
                <SelectItem key={value} value={value}>
                  {paymentMethodLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="refund-from">Du</FieldLabel>
          <Input
            id="refund-from"
            type="date"
            value={from}
            onChange={(event) => change(() => setFrom(event.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="refund-to">Au</FieldLabel>
          <Input
            id="refund-to"
            type="date"
            value={to}
            onChange={(event) => change(() => setTo(event.target.value))}
          />
        </Field>
      </div>

      {/* What Stripe sent back on its own is held apart from the rest: a month where everything
          went back by cheque and a month where the cards reversed themselves read the same in a
          single figure, and they are not the same month to reconcile. */}
      {totals && totals.count > 0 && (
        <dl className="mb-4 grid gap-4 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Remboursements</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{totals.count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rendu</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">
              {formatAmount(totals.givenBack)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Dont par carte</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">
              {formatAmount(totals.online)}
            </dd>
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
          title="Remboursements indisponibles"
          fallback="Les remboursements n'ont pas pu être chargés."
          onRetry={() => void refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Undo2}
          title={filtered ? "Aucun remboursement trouvé" : "Aucun remboursement"}
          description={
            filtered
              ? "Essayez une autre période ou un autre mode."
              : "Un remboursement se donne sur la facture qu'il concerne. Ils apparaîtront tous ici."
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facture</TableHead>
                  <TableHead className="hidden sm:table-cell">Client</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                  <TableHead className="hidden md:table-cell">Mode</TableHead>
                  <TableHead className="hidden lg:table-cell">Pourquoi</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell>
                      <Link
                        href={`/factures/${refund.invoiceId}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {refund.invoiceNumber}
                      </Link>
                      {/* What the hidden columns were carrying, folded under the number so a
                          phone still says whose refund this was and when. */}
                      <div className="truncate text-xs text-muted-foreground sm:hidden">
                        {refund.clientName} · {formatDateOnly(refund.date)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="truncate text-foreground">{refund.clientName}</span>
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                      {formatDateOnly(refund.date)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">{paymentMethodLabels[refund.method]}</Badge>
                      {refund.stripeRefundId && (
                        <Badge variant="outline" className="ml-1">
                          <CreditCard className="size-3" aria-hidden="true" />
                          Stripe
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {refund.note || refund.reference || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {formatAmount(refund.amount)}
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
