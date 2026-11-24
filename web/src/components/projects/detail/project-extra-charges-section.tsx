"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { BilledNotice } from "@/components/projects/detail/billed-notice";
import { ExtraChargeFormSheet } from "@/components/projects/detail/extra-charge-form-sheet";
import { useDeleteExtraCharge, useExtraChargesQuery } from "@/hooks/use-extra-charges";
import { useMarginMode } from "@/hooks/use-products";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { marginPercentFrom } from "@/lib/pricing";
import type { ProjectExtraCharge } from "@/lib/types";

/**
 * What was added to this project's bill beyond the quote. Pressing a row opens the charge.
 *
 * `locked` is the project being billed, and it is the caller's to decide — the API refuses these
 * writes once the invoice is out, so the table is shown as a table one reads rather than as rows
 * that open a panel which could only fail on save.
 */
export function ProjectExtraChargesSection({
  projectId,
  locked,
  taskId,
}: {
  projectId: string;
  locked?: boolean;
  /**
   * Shows only what is attached to this task, and files new rows against it — the same section
   * as on the project, opened from the task's own page.
   */
  taskId?: string;
}) {
  // A failed read is not a project without charges: `data` is undefined either way, so asking
  // only `length === 0` would say there are none when the request merely did not come back.
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } =
    useExtraChargesQuery(projectId);
  const remove = useDeleteExtraCharge(projectId);
  const marginMode = useMarginMode();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectExtraCharge | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ProjectExtraCharge | undefined>(undefined);

  const charges = (data ?? []).filter((charge) => !taskId || charge.projectTaskId === taskId);

  function openCreate() {
    if (locked) return;
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(charge: ProjectExtraCharge) {
    if (locked) return;
    setEditing(charge);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Frais supprimé.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ce frais.");
    }
  }

  // In the header whether or not the table has rows, and repeated inside the empty card. An
  // empty section is where somebody is most likely to be looking for the way to start one.
  const createButton = locked ? undefined : (
    <Button onClick={openCreate}>
      <Plus />
      Nouveau frais
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Frais supplémentaires</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui s&apos;ajoute à la facture et qui n&apos;était pas dans la soumission.
          </p>
        </div>
        {createButton}
      </div>

      {locked && <BilledNotice />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Frais indisponibles"
          fallback="Les frais supplémentaires de ce projet n'ont pas pu être chargés."
          onRetry={() => refetch()}
        />
      ) : charges.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Aucun frais supplémentaire"
          description="Un déplacement de plus, une heure de temps supplémentaire, un supplément de fin de semaine."
          action={createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Frais</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-28 text-right">Coût</TableHead>
                <TableHead className="w-20 text-right">Marge</TableHead>
                <TableHead className="w-28 text-right">Vendant</TableHead>
                {!locked && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((charge) => {
                const margin = marginPercentFrom(charge.cost, charge.sellingPrice, marginMode);
                const cells = (
                  <>
                    <TableCell className="font-medium">
                      {charge.name}
                      {charge.description && (
                        <div className="line-clamp-1 text-xs font-normal text-muted-foreground">
                          {charge.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDateOnly(charge.chargedOn)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {charge.cost == null ? "—" : formatAmount(charge.cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {margin == null
                        ? "—"
                        : `${margin.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {charge.sellingPrice == null ? "—" : formatAmount(charge.sellingPrice)}
                    </TableCell>
                    {!locked && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(charge)}>
                              <Pencil />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(charge)}>
                              <Trash2 />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </>
                );

                // A billed project's rows do not open: a row that announces itself as a button
                // and then shows a panel nothing can be saved from is worse than a plain row.
                return locked ? (
                  <TableRow key={charge.id}>{cells}</TableRow>
                ) : (
                  <ClickableRow
                    key={charge.id}
                    label={`Ouvrir le frais ${charge.name}`}
                    onOpen={() => openEdit(charge)}
                  >
                    {cells}
                  </ClickableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Remounted each time it opens, so a form abandoned halfway does not come back
          half-filled the next time somebody presses the button. */}
      {formOpen && (
        <ExtraChargeFormSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          projectId={projectId}
          charge={editing}
          defaultTaskId={taskId}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Supprimer ce frais ?"
        description={`« ${deleteTarget?.name ?? ""} » sera retiré du projet et de son tableau des coûts.`}
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
