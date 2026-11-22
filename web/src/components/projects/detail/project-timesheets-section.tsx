"use client";

import { useState } from "react";
import { Clock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { BilledNotice } from "@/components/projects/detail/billed-notice";
import {
  TimesheetFormSheet,
  formatHours,
} from "@/components/projects/detail/timesheet-form-sheet";
import { useDeleteTimesheet, useTimesheetsQuery } from "@/hooks/use-timesheets";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import type { TimesheetEntry } from "@/lib/types";

/** The two clock times of a shift, as a span rather than two columns. */
function span(entry: TimesheetEntry): string {
  return `${entry.startTime} – ${entry.endTime}`;
}

/**
 * One date when the shift began and ended the same day, both when it did not: a quart that
 * crosses midnight is the reason the entry carries two dates at all, and collapsing them would
 * hide the only line where that matters.
 */
function dates(entry: TimesheetEntry): string {
  return entry.startDate === entry.endDate
    ? formatDateOnly(entry.startDate)
    : `${formatDateOnly(entry.startDate)} → ${formatDateOnly(entry.endDate)}`;
}

/**
 * The hours worked on one project. Pressing a row opens the entry.
 *
 * `locked` is the project being billed: the API refuses these writes once the invoice is out, so
 * the table is shown as a table one reads rather than as rows that open a panel which could only
 * fail on save. The caller owns the flag — a second place deciding the same lock is a second
 * place to get it wrong.
 */
export function ProjectTimesheetsSection({
  projectId,
  locked,
}: {
  projectId: string;
  locked?: boolean;
}) {
  // A failed read is not a shift nobody worked: `data` is undefined either way, so asking only
  // `length === 0` would say "aucune heure inscrite" about hours that are on file and simply
  // were not fetched — and the total underneath would read 0 h with them. The lock is beside
  // the point: a billed project's sheet can fail to load as easily as any other.
  // And `isError` alone is too wide: a failed background refetch keeps it true over rows
  // that are still right, so the panel only wins with nothing read at all (`!data`) or rows
  // left over from another query key (`isPlaceholderData`).
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useTimesheetsQuery(projectId);
  const remove = useDeleteTimesheet(projectId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TimesheetEntry | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<TimesheetEntry | undefined>(undefined);

  const entries = data ?? [];
  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);

  // Both still check the lock although neither has a button when it is on: the guard is what
  // makes the panel unreachable, rather than it merely having nothing left to press.
  function openCreate() {
    if (locked) return;
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(entry: TimesheetEntry) {
    if (locked) return;
    setEditing(entry);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Heures supprimées.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer ces heures.");
    }
  }

  const createButton = locked ? undefined : (
    <Button onClick={openCreate}>
      <Plus />
      Ajouter des heures
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Feuilles de temps</h2>
          <p className="text-sm text-muted-foreground">
            Les heures travaillées sur ce chantier, arrondies au quart d&apos;heure.
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
          title="Feuilles de temps indisponibles"
          fallback="Les heures de ce projet n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Aucune heure inscrite"
          description="Le quart de chacun, du matin au départ du chantier. Le total est arrondi au quart d'heure, comme sur la facture."
          action={createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employé</TableHead>
                <TableHead className="w-48">Dates</TableHead>
                <TableHead className="w-36">Heures</TableHead>
                <TableHead className="w-24 text-right">Total</TableHead>
                {!locked && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const cells = (
                  <>
                    <TableCell className="font-medium">
                      {/* The hours stay on the project when somebody leaves the payroll, so the
                          line says so rather than showing a blank where a name was. */}
                      {entry.employeeName ?? (
                        <span className="text-muted-foreground">Employé retiré</span>
                      )}
                      {entry.note && (
                        <div className="line-clamp-1 text-xs font-normal text-muted-foreground">
                          {entry.note}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {dates(entry)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {span(entry)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatHours(entry.hours)}
                    </TableCell>
                    {!locked && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(entry)}>
                              <Pencil />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(entry)}>
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
                  <TableRow key={entry.id}>{cells}</TableRow>
                ) : (
                  <ClickableRow
                    key={entry.id}
                    label={`Ouvrir les heures du ${entry.startDate}`}
                    onOpen={() => openEdit(entry)}
                  >
                    {cells}
                  </ClickableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-medium">
                  Total des heures
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatHours(totalHours)}
                </TableCell>
                {!locked && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* The lock is read on every render, not only when the control that opens these was drawn:
          a project can be invoiced from another tab while a panel stands open. */}
      <TimesheetFormSheet
        open={formOpen && !locked}
        onOpenChange={setFormOpen}
        projectId={projectId}
        entry={editing}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget) && !locked}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer ces heures ?"
        description={`Le quart de ${deleteTarget?.employeeName ?? "cet employé"} du ${formatDateOnly(deleteTarget?.startDate)} sera retiré du projet.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
