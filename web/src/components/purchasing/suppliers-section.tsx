"use client";

import { useState } from "react";
import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { SearchInput } from "@/components/layout/search-input";
import { WorkbookMenu } from "@/components/import-export/workbook-menu";
import { SupplierFormSheet } from "@/components/purchasing/supplier-form-sheet";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useDeleteSupplier, useSuppliersQuery } from "@/hooks/use-suppliers";
import { useIsOwner } from "@/hooks/use-can-create";
import { ApiError } from "@/lib/api";
import type { Supplier } from "@/lib/types";

/** Pattern 1 — List / Index. Who the company buys from. */
export function SuppliersSection() {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const debounced = useDebouncedValue(search);

  const { data, isLoading, isError, error, refetch } = useSuppliersQuery(debounced, showInactive);
  const remove = useDeleteSupplier();
  const isOwner = useIsOwner();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | undefined>(undefined);

  const formKey = `${editing?.id ?? "nouveau"}-${formOpen}`;

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Fournisseur supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ce fournisseur.");
    }
  }

  const addButton = (
    <Button
      onClick={() => {
        setEditing(undefined);
        setFormOpen(true);
      }}
    >
      <Plus />
      Nouveau fournisseur
    </Button>
  );

  const items = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Fournisseurs</h2>
          <p className="text-sm text-muted-foreground">
            Les cours, les grossistes et les boutiques chez qui vous achetez.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WorkbookMenu entity="fournisseurs" label="fournisseurs" />
          {items.length > 0 && addButton}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Field className="w-full sm:w-72">
          <FieldLabel htmlFor="supplier-search">Rechercher</FieldLabel>
          <SearchInput
            id="supplier-search"
            className="sm:w-full"
            value={search}
            onChange={setSearch}
            placeholder="Nom, contact ou numéro de compte…"
          />
        </Field>

        <Field orientation="horizontal" className="pb-2">
          <Checkbox
            id="supplier-inactive"
            checked={showInactive}
            onCheckedChange={(checked) => setShowInactive(checked === true)}
          />
          <FieldLabel htmlFor="supplier-inactive" className="font-normal">
            Afficher les inactifs
          </FieldLabel>
        </Field>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Fournisseurs indisponibles"
          fallback="Les fournisseurs n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={debounced ? "Aucun fournisseur trouvé" : "Aucun fournisseur"}
          description={
            debounced
              ? "Aucun nom, contact ou numéro de compte ne correspond."
              : "Ajoutez une cour ou un grossiste : il faut quelqu'un chez qui commander avant de pouvoir écrire une commande."
          }
          action={debounced ? undefined : addButton}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((supplier) => (
            <li
              key={supplier.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{supplier.name}</span>
                  {!supplier.isActive && <Badge variant="secondary">Inactif</Badge>}
                  {supplier.openOrderCount > 0 && (
                    <Badge variant="outline">
                      {supplier.openOrderCount === 1
                        ? "1 commande en cours"
                        : `${supplier.openOrderCount} commandes en cours`}
                    </Badge>
                  )}
                </div>

                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[supplier.contactName, supplier.phone, supplier.email, supplier.city]
                    .filter(Boolean)
                    .join(" · ") || "Aucune coordonnée"}
                </p>

                {supplier.accountNumber && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Compte {supplier.accountNumber}
                  </p>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="shrink-0" aria-label={`Actions pour ${supplier.name}`}>
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(supplier);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil />
                    Modifier
                  </DropdownMenuItem>
                  {isOwner && (
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(supplier)}>
                      <Trash2 />
                      Supprimer
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <SupplierFormSheet key={formKey} open={formOpen} onOpenChange={setFormOpen} supplier={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce fournisseur ?"
        description={`${deleteTarget?.name ?? ""} sera effacé. Un fournisseur avec des commandes ne peut pas être supprimé — rendez-le inactif.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
