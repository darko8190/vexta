"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen, MoreHorizontal, Plus, Trash2 } from "lucide-react";
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
import { DataTable, type DataColumn } from "@/components/layout/data-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { UpgradeCta } from "@/components/layout/upgrade-cta";
import { QuoteFormSheet } from "@/components/quotes/quote-form-sheet";
import { useCanCreate } from "@/hooks/use-can-create";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { storedQuoteValues, useDeleteQuote, useQuotesQuery, useUpdateQuote } from "@/hooks/use-quotes";
import { formatDateOnly } from "@/lib/dates";
import { quoteStatusBadgeVariant, quoteStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatProjectNumber, formatQuoteNumber, type QuoteRecord, type QuoteStatus } from "@/lib/types";

// Acceptée is listed so a converted quote reads right in edit mode; choosing it on one that is
// not converted is refused by the API with the reason.
const editableStatuses = (Object.keys(quoteStatusLabels) as QuoteStatus[]).map((status) => ({
  value: status,
  label: quoteStatusLabels[status],
}));

/**
 * Soumissions: the prices given to clients, before any work is done, and what became of them.
 * An accepted one is converted into a project from its own page.
 */
export default function QuotesPage() {
  const router = useRouter();
  const canCreate = useCanCreate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useQuotesQuery(page, debouncedSearch);
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
      label: "Numéro",
      locked: true,
      headClassName: "w-24",
      cellClassName: "font-mono text-xs font-medium tabular-nums",
      cell: (quote) => formatQuoteNumber(quote.number),
    },
    { key: "client", label: "Client", cellClassName: "font-medium", cell: (quote) => quote.clientName },
    {
      key: "description",
      label: "Description",
      cellClassName: "max-w-xs truncate text-muted-foreground",
      cell: (quote) => quote.description || "—",
      edit: { type: "text", value: (quote) => quote.description ?? "" },
    },
    {
      key: "statut",
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
      label: "Date",
      cellClassName: "text-muted-foreground",
      cell: (quote) => (quote.issuedOn ? formatDateOnly(quote.issuedOn) : "—"),
      edit: { type: "date", value: (quote) => quote.issuedOn ?? "" },
    },
    {
      key: "validite",
      label: "Valide jusqu'au",
      cellClassName: "text-muted-foreground",
      cell: (quote) => (quote.validUntil ? formatDateOnly(quote.validUntil) : "—"),
      edit: { type: "date", value: (quote) => quote.validUntil ?? "" },
    },
    {
      key: "po",
      label: "PO",
      hiddenByDefault: true,
      cellClassName: "text-muted-foreground",
      cell: (quote) => quote.poNumber || "—",
      edit: { type: "text", value: (quote) => quote.poNumber ?? "" },
    },
    {
      key: "projet",
      label: "Projet",
      cellClassName: "font-mono text-xs text-muted-foreground",
      cell: (quote) => (quote.projectNumber != null ? formatProjectNumber(quote.projectNumber) : "—"),
    },
    {
      key: "montant",
      label: "Montant",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (quote) => formatAmount(quote.subtotal),
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

  const addButton = canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus />
      Nouvelle soumission
    </Button>
  ) : (
    <UpgradeCta />
  );

  const searchBox = (
    <SearchInput
      value={search}
      onChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      placeholder="Rechercher une soumission…"
    />
  );

  return (
    <div>
      <PageHeader
        title="Soumissions"
        description="Les prix donnés aux clients, et ce qu'ils sont devenus."
        action={addButton}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <>
          <div className="mb-4">{searchBox}</div>
          <EmptyState
            icon={ClipboardPen}
            title={debouncedSearch ? "Aucune soumission trouvée" : "Aucune soumission pour l'instant"}
            description={
              debouncedSearch
                ? "Essayez une autre recherche."
                : "Préparez un prix : tâches, matériaux et frais. Acceptée, elle devient un projet."
            }
            action={!debouncedSearch ? addButton : undefined}
          />
        </>
      ) : (
        <DataTable
          id="soumissions"
          columns={columns}
          rows={data.items}
          getRowId={(quote) => quote.id}
          rowLabel={(quote) => `Ouvrir la soumission ${formatQuoteNumber(quote.number)}`}
          onOpen={(quote) => router.push(`/soumissions/${quote.id}`)}
          onSaveRow={canCreate ? saveRow : undefined}
          toolbarStart={searchBox}
          actions={(quote) => (
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

      <QuoteFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(created) => router.push(`/soumissions/${created.id}`)}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette soumission ?"
        description={`La soumission ${deleteTarget ? formatQuoteNumber(deleteTarget.number) : ""} et ses lignes seront supprimées. Un projet qui en serait issu reste en place.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
