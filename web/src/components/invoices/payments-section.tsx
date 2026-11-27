"use client";

import { BulkPaymentButton } from "@/components/invoices/bulk-payment-dialog";
import { useCanManage } from "@/hooks/use-can-create";
import { useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
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
import { useAllPaymentsQuery } from "@/hooks/use-payments";
import { formatDateOnly } from "@/lib/dates";
import { paymentMethodLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types";
import { SortableHead } from "@/components/layout/sortable-head";
import { byKeys, sortRows, type SortState } from "@/lib/table-sort";

/** Base UI needs a value for every item, and "" is not one. */
const ALL_METHODS = "tous";

const methods = Object.keys(paymentMethodLabels) as PaymentMethod[];

/**
 * Pattern 1 — List / Index. Every payment the company has taken, across every invoice.
 *
 * Read-only on purpose. A payment is taken against the invoice it pays, because that is where
 * the remainder is worked out and where the client's account gets written; a form here could
 * only ever be a second way to do the same thing, drifting from the first.
 */
export function PaymentsSection() {
  const canManage = useCanManage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useAllPaymentsQuery(
    page,
    debouncedSearch,
    {
      method: (method || undefined) as PaymentMethod | undefined,
      from: from || undefined,
      to: to || undefined,
    },
  );

  const items = data?.page.items ?? [];
  const [sort, setSort] = useState<SortState | null>(null);
  const totals = data?.totals;
  const filtered = Boolean(debouncedSearch || method || from || to);

  /** Reset to the first page whenever the question changes: page 4 of a new filter is nowhere. */
  function change(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Paiements</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui est rentré, toutes factures confondues.
          </p>
        </div>
        {canManage && <BulkPaymentButton />}
      </div>

      {/* Every filter carries a visible label, including the search: two labelled fields beside
          two unlabelled ones put the row on two baselines, and the eye reads that as a mistake
          before it reads the filters. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field className="sm:col-span-2 lg:col-span-1">
          <FieldLabel htmlFor="payment-search">Rechercher</FieldLabel>
          <SearchInput
            id="payment-search"
            className="sm:w-full"
            value={search}
            onChange={(value) => change(() => setSearch(value))}
            placeholder="Numéro, client ou référence…"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="payment-method">Mode</FieldLabel>
          <Select
            value={method || ALL_METHODS}
            onValueChange={(value) =>
              change(() => setMethod(!value || value === ALL_METHODS ? "" : value))
            }
          >
            <SelectTrigger id="payment-method" className="w-full">
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
          <FieldLabel htmlFor="payment-from">Du</FieldLabel>
          <Input
            id="payment-from"
            type="date"
            value={from}
            onChange={(event) => change(() => setFrom(event.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-to">Au</FieldLabel>
          <Input
            id="payment-to"
            type="date"
            value={to}
            onChange={(event) => change(() => setTo(event.target.value))}
          />
        </Field>
      </div>

      {/* Porté au compte is held apart from the rest because it is not money: the invoice was
          settled against the client's account. Adding it to a day's takings would make the till
          look fuller than the bank. */}
      {totals && totals.count > 0 && (
        <dl className="mb-4 grid gap-4 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Paiements</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{totals.count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Encaissé</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">
              {formatAmount(totals.received)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Porté au compte</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">
              {formatAmount(totals.onAccount)}
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
          title="Paiements indisponibles"
          fallback="Les paiements n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={filtered ? "Aucun paiement trouvé" : "Aucun paiement pour l'instant"}
          description={
            filtered
              ? "Essayez une autre période ou un autre mode."
              : "Les paiements se prennent sur la facture qu'ils règlent. Ils apparaîtront tous ici."
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Facture" sortKey="facture" sort={sort} onSort={setSort} />
                  <SortableHead label="Client" sortKey="client" sort={sort} onSort={setSort} className="hidden sm:table-cell" />
                  <SortableHead label="Date" sortKey="date" sort={sort} onSort={setSort} className="hidden lg:table-cell" />
                  <SortableHead label="Mode" sortKey="mode" sort={sort} onSort={setSort} className="hidden md:table-cell" />
                  <SortableHead label="Référence" sortKey="reference" sort={sort} onSort={setSort} className="hidden lg:table-cell" />
                  <SortableHead label="Montant" sortKey="montant" sort={sort} onSort={setSort} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortRows(items, sort, byKeys((payment) => ({ facture: payment.invoiceNumber, client: payment.clientName, date: payment.date, mode: payment.method, reference: payment.reference, montant: payment.amount }))).map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <Link
                        href={`/factures/${payment.invoiceId}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {payment.invoiceNumber}
                      </Link>
                      {/* What the hidden columns were carrying, folded under the number so a
                          phone still says whose payment this was and when. */}
                      <div className="truncate text-xs text-muted-foreground sm:hidden">
                        {payment.clientName} · {formatDateOnly(payment.date)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="truncate text-foreground">{payment.clientName}</span>
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                      {formatDateOnly(payment.date)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={payment.method === "PorteAuCompte" ? "outline" : "secondary"}>
                        {paymentMethodLabels[payment.method]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {payment.reference || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {formatAmount(payment.amount)}
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
