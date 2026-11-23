"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, MoreHorizontal, PackageCheck, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { GoodsReceiptSheet } from "@/components/purchasing/goods-receipt-sheet";
import { PurchaseOrderSheet } from "@/components/purchasing/purchase-order-sheet";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useDeletePurchaseOrder,
  usePurchaseOrderQuery,
  usePurchaseOrdersQuery,
  useSetPurchaseOrderStatus,
} from "@/hooks/use-suppliers";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import { purchaseOrderStatusBadgeVariant, purchaseOrderStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatProjectNumber } from "@/lib/types";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/lib/types";

/** Base UI needs a value for every item, and "" is not one. */
const ALL_STATUSES = "tous";

const statuses = Object.keys(purchaseOrderStatusLabels) as PurchaseOrderStatus[];

/**
 * Pattern 1 — List / Index. What has been ordered, and where each order stands.
 *
 * The two received states are never set from here: they are read off the deliveries. A status
 * somebody can tick is a status that says a truck arrived when it did not.
 */
export function PurchaseOrdersSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const debounced = useDebouncedValue(search);

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = usePurchaseOrdersQuery(
    page,
    debounced,
    { status: (status || undefined) as PurchaseOrderStatus | undefined },
  );
  const setStatusMutation = useSetPurchaseOrderStatus();
  const remove = useDeletePurchaseOrder();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | undefined>(undefined);

  // Only fetched while a sheet is open on it, so the list does not pull every order's lines.
  const { data: editing } = usePurchaseOrderQuery(editingId ?? undefined);

  async function changeStatus(id: string, next: PurchaseOrderStatus) {
    try {
      await setStatusMutation.mutateAsync({ id, status: next });
      toast.success(next === "Envoyee" ? "Commande envoyée." : "Commande annulée.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de changer le statut.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Commande supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette commande.");
    }
  }

  function change(apply: () => void) {
    apply();
    setPage(1);
  }

  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus />
      Nouvelle commande
    </Button>
  );

  const items = data?.items ?? [];
  const filtered = Boolean(debounced || status);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Commandes</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui a été commandé chez vos fournisseurs, et ce qui est encore attendu.
          </p>
        </div>
        {items.length > 0 && addButton}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field className="sm:col-span-2 lg:col-span-2">
          <FieldLabel htmlFor="order-search">Rechercher</FieldLabel>
          <SearchInput
            id="order-search"
            className="sm:w-full"
            value={search}
            onChange={(value) => change(() => setSearch(value))}
            placeholder="Numéro, fournisseur ou référence…"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="order-status">Statut</FieldLabel>
          <Select
            value={status || ALL_STATUSES}
            onValueChange={(value) =>
              change(() => setStatus(!value || value === ALL_STATUSES ? "" : value))
            }
          >
            <SelectTrigger id="order-status" className="w-full">
              <SelectValue>
                {(value: string) =>
                  value === ALL_STATUSES
                    ? "Tous les statuts"
                    : purchaseOrderStatusLabels[value as PurchaseOrderStatus]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>Tous les statuts</SelectItem>
              {statuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {purchaseOrderStatusLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          title="Commandes indisponibles"
          fallback="Les commandes n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filtered ? "Aucune commande trouvée" : "Aucune commande"}
          description={
            filtered
              ? "Essayez un autre statut ou une autre recherche."
              : "Écrivez votre première commande. Elle part en brouillon, et vous l'envoyez quand elle est prête."
          }
          action={filtered ? undefined : addButton}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commande</TableHead>
                  <TableHead className="hidden sm:table-cell">Fournisseur</TableHead>
                  <TableHead className="hidden lg:table-cell">Projet</TableHead>
                  <TableHead className="hidden md:table-cell">Statut</TableHead>
                  <TableHead className="hidden lg:table-cell">Promise</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <span className="font-medium tabular-nums text-foreground">{order.number}</span>
                      {/* What the hidden columns carried, folded under the number so a phone
                          still says who it went to and where it stands. */}
                      <div className="truncate text-xs text-muted-foreground sm:hidden">
                        {order.supplierName} · {purchaseOrderStatusLabels[order.status]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateOnly(order.orderedOn)}
                      </div>
                    </TableCell>

                    <TableCell className="hidden sm:table-cell">
                      <span className="truncate text-foreground">{order.supplierName}</span>
                    </TableCell>

                    <TableCell className="hidden lg:table-cell">
                      {order.projectId ? (
                        <Link
                          href={`/projets/${order.projectId}`}
                          className="text-foreground underline-offset-4 hover:underline"
                        >
                          {formatProjectNumber(order.projectNumber!)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Stock</span>
                      )}
                    </TableCell>

                    <TableCell className="hidden md:table-cell">
                      <Badge variant={purchaseOrderStatusBadgeVariant[order.status]}>
                        {purchaseOrderStatusLabels[order.status]}
                      </Badge>
                    </TableCell>

                    <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                      {formatDateOnly(order.expectedOn)}
                    </TableCell>

                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {formatAmount(order.total)}
                    </TableCell>

                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" aria-label={`Actions sur la commande ${order.number}`}>
                              <MoreHorizontal />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingId(order.id)}>
                            <Pencil />
                            Ouvrir
                          </DropdownMenuItem>

                          {order.status === "Brouillon" && (
                            <DropdownMenuItem onClick={() => changeStatus(order.id, "Envoyee")}>
                              <Send />
                              Marquer envoyée
                            </DropdownMenuItem>
                          )}

                          {order.status !== "Annulee" && order.status !== "Recue" && (
                            <DropdownMenuItem onClick={() => setReceiving(order)}>
                              <PackageCheck />
                              Noter une réception
                            </DropdownMenuItem>
                          )}

                          {order.status !== "Annulee" && (
                            <DropdownMenuItem onClick={() => changeStatus(order.id, "Annulee")}>
                              <X />
                              Annuler la commande
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(order)}>
                            <Trash2 />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar result={data} onPageChange={setPage} />
        </>
      )}

      {creating && (
        <PurchaseOrderSheet open onOpenChange={(open) => !open && setCreating(false)} />
      )}

      {/* Mounted only once its lines are in hand: a sheet that opens empty and fills itself a
          moment later is a sheet somebody starts typing into twice. */}
      {editingId && editing && (
        <PurchaseOrderSheet
          key={editingId}
          open
          onOpenChange={(open) => !open && setEditingId(null)}
          detail={editing}
        />
      )}

      {receiving && (
        <GoodsReceiptSheet
          key={receiving.id}
          open
          onOpenChange={(open) => !open && setReceiving(null)}
          orderId={receiving.id}
          orderNumber={receiving.number}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette commande ?"
        description={`La commande ${deleteTarget?.number ?? ""} sera effacée. Une commande avec des réceptions ne peut pas être supprimée — annulez-la.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
