"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, ClipboardPen, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import type { BulkAction } from "@/components/layout/bulk-actions";
import { DataTable, type DataColumn } from "@/components/layout/data-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateLibraryButton } from "@/components/templates/template-library";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { QuoteFormSheet } from "@/components/quotes/quote-form-sheet";
import { useCanCreate, useIsClientUser } from "@/hooks/use-can-create";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  storedQuoteValues,
  useDeleteQuote,
  useQuoteStatusCountsQuery,
  useQuotesQuery,
  useUpdateQuote,
} from "@/hooks/use-quotes";
import { formatDateOnly } from "@/lib/dates";
import { quoteStatusBadgeVariant, quoteStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatProjectNumber, formatQuoteNumber, type QuoteRecord, type QuoteStatus } from "@/lib/types";
import { filtersToQuery, type TableFilters } from "@/lib/table-filters";
import { NUMBER_DESC, sortToQuery, type SortState } from "@/lib/table-sort";
import { useClientSummaryQuery } from "@/hooks/use-clients";
import { StatusPills } from "@/components/layout/status-pills";

// Acceptée is listed so a converted quote reads right in edit mode; choosing it on one that is
// not converted is refused by the API with the reason.
// Replaced is the result of « Réviser », never a choice in a cell.
const editableStatuses = (Object.keys(quoteStatusLabels) as QuoteStatus[]).filter((status) => status !== "Remplacee").map((status) => ({
  value: status,
  label: quoteStatusLabels[status],
}));

/**
 * Soumissions: the prices given to clients, before any work is done, and what became of them.
 * An accepted one is converted into a project from its own page.
 *
 * A customer lands here too, on the quotes they were sent: read-only, and answered from each
 * quote's own page.
 */
export default function QuotesPage() {
  const router = useRouter();
  const isClient = useIsClientUser();
  const canCreate = useCanCreate() && !isClient;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "Toutes">("Toutes");
  const debouncedSearch = useDebouncedValue(search);

  const [filters, setFilters] = useState<TableFilters>({});
  const [sort, setSort] = useState<SortState>(NUMBER_DESC);
  const { data, isLoading } = useQuotesQuery(
    page,
    debouncedSearch,
    statusFilter === "Toutes" ? undefined : statusFilter,
    undefined,
    { ...filtersToQuery(filters), ...sortToQuery(sort) },
  );
  const { data: clientOptions } = useClientSummaryQuery(!isClient);
  const { data: counts } = useQuoteStatusCountsQuery();
  // A customer never sees a draft, so the filter does not offer one.
  const filterOptions: (QuoteStatus | "Toutes")[] = [
    "Toutes",
    ...(Object.keys(quoteStatusLabels) as QuoteStatus[]).filter((status) => !isClient || status !== "Brouillon"),
  ];
  const update = useUpdateQuote();
  const remove = useDeleteQuote();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuoteRecord | undefined>(undefined);

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Soumission supprimée.");
      setDeleteTarget(undefined);
    } catch {
      toast.error("Impossible de supprimer cette soumission.");
    }
  }

  const columns: DataColumn<QuoteRecord>[] = [
    {
      key: "numero",
      sortable: true,
      filter: { type: "number" },
      label: "Numéro",
      locked: true,
      headClassName: "w-24",
      cellClassName: "font-mono text-xs font-medium tabular-nums",
      cell: (quote) => formatQuoteNumber(quote.number, quote.revision),
    },
    { key: "client",
      sortable: true, filter: isClient ? undefined : { type: "select", options: (clientOptions ?? []).map((c) => ({ value: c.id, label: c.name })) }, label: "Client", cellClassName: "font-medium", cell: (quote) => quote.clientName },
    {
      key: "description",
      sortable: true,
      filter: { type: "text" },
      label: "Description",
      cellClassName: "max-w-xs truncate text-muted-foreground",
      cell: (quote) => quote.description || "—",
      edit: { type: "text", value: (quote) => quote.description ?? "" },
    },
    {
      key: "statut",
      sortable: true,
      filter: { type: "select", options: (Object.keys(quoteStatusLabels) as QuoteStatus[]).map((status) => ({ value: status, label: quoteStatusLabels[status] })) },
      label: "Statut",
      cell: (quote) => (
        <Badge variant={quoteStatusBadgeVariant[quote.status]}>{quoteStatusLabels[quote.status]}</Badge>
      ),
      edit: {
        type: "select",
        value: (quote) => quote.status,
        options: editableStatuses,
      },
    },
    {
      key: "date",
      sortable: true,
      filter: { type: "date" },
      label: "Date",
      cellClassName: "text-muted-foreground",
      cell: (quote) => (quote.issuedOn ? formatDateOnly(quote.issuedOn) : "—"),
      edit: { type: "date", value: (quote) => quote.issuedOn ?? "" },
    },
    {
      key: "validite",
      sortable: true,
      filter: { type: "date" },
      label: "Valide jusqu'au",
      cellClassName: "text-muted-foreground",
      cell: (quote) => (quote.validUntil ? formatDateOnly(quote.validUntil) : "—"),
      edit: { type: "date", value: (quote) => quote.validUntil ?? "" },
    },
    {
      key: "po",
      sortable: true,
      filter: { type: "text" },
      label: "PO",
      hiddenByDefault: true,
      cellClassName: "text-muted-foreground",
      cell: (quote) => quote.poNumber || "—",
      edit: { type: "text", value: (quote) => quote.poNumber ?? "" },
    },
    {
      key: "projet",
      filter: { type: "number" },
      label: "Projet",
      cellClassName: "font-mono text-xs text-muted-foreground",
      cell: (quote) => (quote.projectNumber != null ? formatProjectNumber(quote.projectNumber) : "—"),
    },
    {
      key: "montant",
      filter: { type: "number" },
      label: "Montant",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (quote) => formatAmount(quote.subtotal),
    },
  ];

  const setQuoteStatus = (quote: QuoteRecord, next: QuoteStatus) =>
    update.mutateAsync({ id: quote.id, values: { ...storedQuoteValues(quote), status: next } });

  const bulkActions: BulkAction<QuoteRecord>[] = [
    {
      key: "acceptee",
      label: "Marquer acceptée",
      icon: CircleCheck,
      applies: (quote) => quote.status !== "Acceptee" && quote.status !== "Remplacee" && quote.status !== "EnProjet",
      run: (quote) => setQuoteStatus(quote, "Acceptee"),
      done: (count) => `${count} soumission(s) marquée(s) acceptée(s).`,
    },
    {
      key: "refusee",
      label: "Marquer refusée",
      icon: CircleX,
      applies: (quote) => quote.status !== "Refusee" && quote.status !== "Remplacee" && quote.status !== "EnProjet",
      run: (quote) => setQuoteStatus(quote, "Refusee"),
      done: (count) => `${count} soumission(s) marquée(s) refusée(s).`,
    },
    {
      key: "supprimer",
      label: "Supprimer",
      icon: Trash2,
      destructive: true,
      confirm: {
        title: "Supprimer les soumissions sélectionnées ?",
        description: (count) => `${count} soumission(s) iront à la corbeille (Paramètres). Vous pourrez les restaurer.`,
      },
      run: (quote) => remove.mutateAsync(quote.id),
      done: (count) => (count > 1 ? `${count} soumissions supprimées.` : "Soumission supprimée."),
    },
  ];

  async function saveRow(quote: QuoteRecord, changes: Record<string, string>) {
    const values = storedQuoteValues(quote);
    if ("description" in changes) values.description = changes.description || null;
    if ("statut" in changes) values.status = changes.statut as QuoteStatus;
    if ("date" in changes) values.issuedOn = changes.date || null;
    if ("validite" in changes) values.validUntil = changes.validite || null;
    if ("po" in changes) values.poNumber = changes.po.trim() || null;
    await update.mutateAsync({ id: quote.id, values });
  }

  const addButton = isClient ? null : canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus />
      Nouvelle soumission
    </Button>
  ) : (
    <UpgradeCta />
  );

  const searchBox = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="min-w-0 flex-1">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Rechercher une soumission…"
        />
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={isClient ? "Mes soumissions" : "Soumissions"}
        description={
          isClient
            ? "Les prix que votre fournisseur vous a envoyés. Ouvrez-en une pour l'accepter ou la refuser."
            : "Les prix donnés aux clients, et ce qu'ils sont devenus."
        }
        action={
          isClient ? (
            addButton
          ) : (
            <div className="flex flex-wrap gap-2">
              <TemplateLibraryButton kind="soumission" />
              {addButton}
            </div>
          )
        }
      />

      <StatusPills
        options={filterOptions.filter((o) => o !== "Toutes").map((o) => ({ value: o as QuoteStatus, label: quoteStatusLabels[o as QuoteStatus] }))}
        value={statusFilter === "Toutes" ? "" : statusFilter}
        onChange={(next) => {
          setStatusFilter(next === "" ? "Toutes" : next);
          setPage(1);
        }}
        counts={counts}
        allLabel="Toutes"
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || (data.items.length === 0 && Object.keys(filters).length === 0) ? (
        <>
          <div className="mb-4">{searchBox}</div>
          <EmptyState
            icon={ClipboardPen}
            title={
              debouncedSearch || statusFilter !== "Toutes"
                ? "Aucune soumission trouvée"
                : "Aucune soumission pour l'instant"
            }
            description={
              debouncedSearch || statusFilter !== "Toutes"
                ? "Essayez une autre recherche ou un autre statut."
                : isClient
                  ? "Aucune soumission ne vous a été envoyée pour l'instant."
                  : "Préparez un prix : tâches, matériaux et frais. Acceptée, elle devient un projet."
            }
            action={!debouncedSearch && statusFilter === "Toutes" && addButton ? addButton : undefined}
          />
        </>
      ) : (
        <DataTable
          id="soumissions"
          filters={filters}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          onFiltersChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          columns={columns}
          rows={data.items}
          getRowId={(quote) => quote.id}
          rowLabel={(quote) => `Ouvrir la soumission ${formatQuoteNumber(quote.number, quote.revision)}`}
          onOpen={(quote) => router.push(`/soumissions/${quote.id}`)}
          onSaveRow={canCreate ? saveRow : undefined}
          bulkActions={canCreate ? bulkActions : undefined}
          toolbarStart={searchBox}
          actions={isClient ? undefined : (quote) => (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(quote)}>
                  <Trash2 />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      )}

      <PaginationBar result={data} onPageChange={setPage} />

      {/* Not mounted for a customer: closed, it still asks for the company's wage scales. */}
      {!isClient && (
        <QuoteFormSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          onCreated={(created) => router.push(`/soumissions/${created.id}`)}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette soumission ?"
        description={`La soumission ${deleteTarget ? formatQuoteNumber(deleteTarget.number, deleteTarget.revision) : ""} et ses lignes seront supprimées. Un projet qui en serait issu reste en place.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
