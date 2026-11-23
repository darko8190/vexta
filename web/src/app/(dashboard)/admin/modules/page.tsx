"use client";

import { useState } from "react";
import { Blocks, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleFormSheet } from "@/components/catalog/module-form-sheet";
import { ModulesTable } from "@/components/catalog/modules-table";
import { useDeleteModule, useModulesQuery } from "@/hooks/use-catalog";
import { ApiError } from "@/lib/api";
import type { ModuleRecord } from "@/lib/types";

export default function ModulesPage() {
  // A failed read is not a platform without modules — and `!data` was swallowing the failure
  // into the empty branch, so an outage invited an admin to re-create the modules that already
  // compose every forfait. There is no search on this page, so empty really means empty.
  // And `isError` alone is too wide: a failed background refetch keeps it true over rows
  // that are still right, so the panel only wins with nothing read at all (`!data`) or rows
  // left over from another query key (`isPlaceholderData`).
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useModulesQuery();
  const deleteModule = useDeleteModule();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModuleRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ModuleRecord | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteModule.mutateAsync(deleteTarget.id);
      toast.success("Module supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ce module.");
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouveau module
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Modules"
        description="Les capacités présentées sur le site public et cochées dans chaque forfait."
        action={createButton}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Modules indisponibles"
          fallback="Les modules n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title="Aucun module pour l'instant"
          description="Créez les modules qui décrivent ce que Vexta fait. Ils composent la grille du site public."
          action={createButton}
        />
      ) : (
        /* Keyed on the server's order: a save or a refetch that returns a different
           arrangement remounts the table with it, while one that returns the same thing leaves
           a drag in progress alone. */
        <ModulesTable
          key={data.map((module) => module.id).join()}
          modules={data}
          onEdit={(module) => {
            setEditing(module);
            setFormOpen(true);
          }}
          onDelete={setDeleteTarget}
        />
      )}

      <ModuleFormSheet open={formOpen} onOpenChange={setFormOpen} module={editing} modules={data ?? []} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ce module ?"
        description={`« ${deleteTarget?.title} » disparaîtra du site public. Un module inclus dans un forfait ne peut pas être supprimé.`}
        onConfirm={confirmDelete}
        pending={deleteModule.isPending}
      />
    </div>
  );
}
