"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableHead } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Something done to every selected row at once: « Passer en client », « Supprimer ».
 *
 * Run one row at a time through the same request the row's own menu sends, so every rule the
 * API holds for one row (a billed project stays locked, a used product stays) still holds for
 * twenty; the rows it refuses are named afterwards instead of failing the whole batch.
 */
export interface BulkAction<T> {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
  /** Rows this action makes no sense for are left out, and counted as skipped. */
  applies?: (row: T) => boolean;
  /** Asked before anything runs, for what cannot be taken back. */
  confirm?: { title: string; description: (count: number) => string };
  run: (row: T) => Promise<unknown>;
  /** The toast once done: « 3 clients passés en client. » */
  done: (count: number) => string;
  /** Once every row has run, e.g. to refresh the lists the requests touched. */
  finish?: () => unknown;
}

/** Which rows are ticked, by id. Forgets rows that are no longer on screen. */
export function useRowSelection<T>(rows: T[], getRowId: (row: T) => string) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const ids = rows.map(getRowId);
  const present = new Set(ids);
  const selectedIds = [...ticked].filter((id) => present.has(id));
  const selectedRows = rows.filter((row) => ticked.has(getRowId(row)));

  return {
    selectedIds,
    selectedRows,
    isSelected: (row: T) => ticked.has(getRowId(row)),
    toggle: (row: T, on: boolean) =>
      setTicked((current) => {
        const next = new Set(current);
        if (on) next.add(getRowId(row));
        else next.delete(getRowId(row));
        return next;
      }),
    allSelected: ids.length > 0 && selectedIds.length === ids.length,
    someSelected: selectedIds.length > 0 && selectedIds.length < ids.length,
    toggleAll: (on: boolean) => setTicked(on ? new Set(ids) : new Set()),
    clear: () => setTicked(new Set()),
  };
}

export type RowSelection<T> = ReturnType<typeof useRowSelection<T>>;

/** The heading cell: ticks or unticks every row on the page. */
export function SelectAllHead<T>({ selection }: { selection: RowSelection<T> }) {
  return (
    <TableHead className="w-10 pr-0">
      <Checkbox
        aria-label="Tout sélectionner"
        checked={selection.allSelected}
        indeterminate={selection.someSelected}
        onCheckedChange={(checked) => selection.toggleAll(checked === true)}
      />
    </TableHead>
  );
}

/** One row's tick box. A press on it selects the row and never opens it. */
export function SelectRowCell<T>({ selection, row, label }: { selection: RowSelection<T>; row: T; label: string }) {
  return (
    <TableCell className="w-10 pr-0" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <Checkbox
        aria-label={`Sélectionner ${label}`}
        checked={selection.isSelected(row)}
        onCheckedChange={(checked) => selection.toggle(row, checked === true)}
      />
    </TableCell>
  );
}

/**
 * The bar that appears above a table once rows are ticked: how many, what can be done to them,
 * and a way to untick them all.
 */
export function BulkActionBar<T>({
  selection,
  actions,
  className,
}: {
  selection: RowSelection<T>;
  actions: BulkAction<T>[];
  className?: string;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<BulkAction<T> | null>(null);
  const count = selection.selectedRows.length;

  if (count === 0) return null;

  async function run(action: BulkAction<T>) {
    const targets = selection.selectedRows.filter((row) => action.applies?.(row) ?? true);
    const skipped = count - targets.length;
    if (targets.length === 0) {
      toast.info("Aucune des lignes sélectionnées n'est concernée par cette action.");
      return;
    }

    setRunning(action.key);
    let succeeded = 0;
    const problems: string[] = [];
    for (const row of targets) {
      try {
        await action.run(row);
        succeeded++;
      } catch (error) {
        problems.push(error instanceof ApiError ? error.message : "Erreur inattendue.");
      }
    }
    await action.finish?.();
    setRunning(null);
    setConfirming(null);
    selection.clear();

    if (succeeded > 0) toast.success(action.done(succeeded) + (skipped > 0 ? ` ${skipped} non concernée(s).` : ""));
    if (problems.length > 0) {
      toast.error(`${problems.length} ligne(s) non traitée(s) : ${problems[0]}`);
    }
  }

  return (
    <div
      role="toolbar"
      aria-label="Actions sur la sélection"
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2",
        className,
      )}
    >
      <span className="text-sm font-medium text-foreground">
        {count} sélectionnée{count > 1 ? "s" : ""}
      </span>
      <div className="flex flex-1 flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.key}
            size="sm"
            variant={action.destructive ? "destructive" : "outline"}
            disabled={running !== null}
            onClick={() => (action.confirm ? setConfirming(action) : void run(action))}
          >
            {running === action.key ? <Spinner /> : action.icon && <action.icon />}
            {action.label}
          </Button>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={selection.clear} disabled={running !== null}>
        <X />
        Désélectionner
      </Button>

      <ConfirmDeleteDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => !open && running === null && setConfirming(null)}
        title={confirming?.confirm?.title ?? ""}
        description={confirming?.confirm?.description(count) ?? ""}
        onConfirm={() => confirming && void run(confirming)}
        pending={running !== null}
      />
    </div>
  );
}
