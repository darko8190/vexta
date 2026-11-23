"use client";

import { useState } from "react";
import { Car, MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { AssetFormSheet } from "@/components/clients/detail/asset-form-sheet";
import { useCanManage } from "@/hooks/use-can-create";
import {
  useClientAssetsQuery,
  useDeleteClientAsset,
} from "@/hooks/use-client-assets";
import { ApiError } from "@/lib/api";
import type { ClientAsset } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The two numbers it is known by, on one line, so a clerk can match what the customer says. */
function identifiers(asset: ClientAsset): string[] {
  return [
    asset.serialNumber ? `Série ${asset.serialNumber}` : null,
    asset.reference ? `Réf. ${asset.reference}` : null,
    asset.usage != null ? `${asset.usage.toLocaleString("fr-CA")} ${asset.usageUnit ?? ""}`.trim() : null,
  ].filter((value): value is string => Boolean(value));
}

/**
 * What this client owns that work gets done on.
 *
 * Cards rather than a table: an asset carries a designation, two serial numbers, a reading and
 * sometimes an address, and that does not fit a row at phone width — which is where a counter
 * clerk is standing when a customer reads out a plate.
 *
 * Retired assets are hidden behind a checkbox rather than deleted. A shop that has served the
 * same client for ten years would otherwise open on a list of cars they no longer own, and the
 * work done on those cars is still history.
 */
export function ClientAssetsSection({ clientId }: { clientId: string }) {
  const canManage = useCanManage();
  const [includeRetired, setIncludeRetired] = useState(false);
  const {
    data,
    isLoading,
    isError,
    isPlaceholderData,
    error: loadError,
    refetch,
  } = useClientAssetsQuery(clientId, includeRetired);

  const remove = useDeleteClientAsset(clientId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientAsset | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ClientAsset | undefined>(undefined);

  const assets = data ?? [];

  function openCreate() {
    if (!canManage) return;
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(asset: ClientAsset) {
    if (!canManage) return;
    setEditing(asset);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Actif supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cet actif.");
    }
  }

  const createButton = canManage ? (
    <Button onClick={openCreate}>
      <Plus />
      Ajouter un actif
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Actifs</h2>
          <p className="text-sm text-muted-foreground">
            Ce sur quoi vous travaillez chez ce client : véhicules, bâtiments, appareils.
          </p>
        </div>
        {createButton}
      </div>

      <Field orientation="horizontal" className="mb-4">
        <Checkbox
          id="assets-include-retired"
          checked={includeRetired}
          onCheckedChange={(checked) => setIncludeRetired(checked === true)}
        />
        <FieldLabel htmlFor="assets-include-retired" className="font-normal">
          Afficher ceux qui ne sont plus en service
        </FieldLabel>
      </Field>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Actifs indisponibles"
          fallback="Les actifs de ce client n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Car}
          title="Aucun actif"
          description="Ajoutez les véhicules, les bâtiments ou les appareils de ce client pour savoir sur quoi vous êtes déjà intervenu."
          action={createButton}
        />
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border border-border bg-card p-3",
                !asset.isActive && "opacity-60",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{asset.designation}</span>
                  {asset.assetTypeName && <Badge variant="secondary">{asset.assetTypeName}</Badge>}
                  {!asset.isActive && <Badge variant="outline">Hors service</Badge>}
                </div>

                {/* The label is shown under the designation only when they differ: repeating
                    "Toyota Corolla 2018" twice says nothing. */}
                {asset.label !== asset.designation && (
                  <p className="text-sm text-muted-foreground">{asset.label}</p>
                )}

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {identifiers(asset).map((value) => (
                    <span key={value} className="tabular-nums">
                      {value}
                    </span>
                  ))}
                  {asset.addressLine && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0" />
                      {asset.addressLine}
                    </span>
                  )}
                </div>

                {asset.notes && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{asset.notes}</p>
                )}
              </div>

              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon" aria-label={`Actions sur ${asset.designation}`} />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(asset)}>
                      <Pencil />
                      Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(asset)}>
                      <Trash2 />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      <AssetFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        clientId={clientId}
        asset={editing}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Supprimer cet actif ?"
        description={
          deleteTarget
            ? `« ${deleteTarget.designation} » sera retiré de la fiche. Pour le garder dans l'historique, décochez plutôt « Toujours en service ».`
            : ""
        }
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
