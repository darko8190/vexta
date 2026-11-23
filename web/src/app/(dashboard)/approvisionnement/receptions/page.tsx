"use client";

import { useState } from "react";
import { PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useDeleteGoodsReceipt, useGoodsReceiptsQuery } from "@/hooks/use-suppliers";
import { useIsOwner } from "@/hooks/use-can-create";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import type { GoodsReceipt } from "@/lib/types";

/**
 * Pattern 1 — List / Index. What arrived, and against which order.
 *
 * Deliveries are noted from the order they belong to, which is where the quantities still owed
 * are known. This is the list of everything that has come in — read by whoever reconciles the
 * supplier's invoice at the end of the month.
 */
export default function GoodsReceiptsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search);

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useGoodsReceiptsQuery(
    page,
    debounced,
  );
  const remove = useDeleteGoodsReceipt();
  const isOwner = useIsOwner();

  const [deleteTarget, setDeleteTarget] = useState<GoodsReceipt | undefined>(undefined);

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Réception retirée. La commande revient à ce que les autres livraisons disent.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de retirer cette réception.");
    }
  }

  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Réceptions"
        description="Ce qui est entré par la porte arrière, livraison par livraison."
      />

      <div className="mb-4">
        <Field className="w-full sm:w-96">
          <FieldLabel htmlFor="receipt-search">Rechercher</FieldLabel>
          <SearchInput
            id="receipt-search"
            className="sm:w-full"
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Numéro de commande, fournisseur ou bon de livraison…"
          />
        </Field>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={error}
          title="Réceptions indisponibles"
          fallback="Les réceptions n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={debounced ? "Aucune réception trouvée" : "Aucune réception"}
          description={
            debounced
              ? "Aucun numéro, fournisseur ou bon de livraison ne correspond."
              : "Les réceptions se notent depuis la commande concernée : c'est là qu'on sait ce qui reste à recevoir."
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reçue le</TableHead>
                  <TableHead>Commande</TableHead>
                  <TableHead className="hidden sm:table-cell">Fournisseur</TableHead>
                  <TableHead className="hidden lg:table-cell">Bon de livraison</TableHead>
                  <TableHead className="text-right">Lignes</TableHead>
                  {isOwner && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell className="tabular-nums text-foreground">
                      {formatDateOnly(receipt.receivedOn)}
                      <div className="truncate text-xs text-muted-foreground sm:hidden">
                        {receipt.supplierName}
                      </div>
                    </TableCell>

                    <TableCell className="font-medium tabular-nums text-foreground">
                      {receipt.orderNumber}
                    </TableCell>

                    <TableCell className="hidden sm:table-cell">
                      <span className="truncate text-foreground">{receipt.supplierName}</span>
                    </TableCell>

                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {receipt.slipNumber || "—"}
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {receipt.lineCount}
                    </TableCell>

                    {isOwner && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Retirer la réception du ${formatDateOnly(receipt.receivedOn)}`}
                          onClick={() => setDeleteTarget(receipt)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar result={data} onPageChange={setPage} />
        </>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Retirer cette réception ?"
        description={`La livraison du ${formatDateOnly(deleteTarget?.receivedOn)} sera effacée et la commande ${deleteTarget?.orderNumber ?? ""} reviendra à ce que les autres livraisons disent.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
