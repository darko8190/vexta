"use client";

import { useIsCrewView } from "@/hooks/use-can-create";
import { useState } from "react";
import { Image as ImageIcon, MoreHorizontal, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { ExpenseFormSheet } from "@/components/projects/detail/expense-form-sheet";
import { useDeleteExpense, useExpensesQuery } from "@/hooks/use-expenses";
import { ApiError } from "@/lib/api";
import { matchesSearch } from "@/lib/text-match";
import { SearchInput } from "@/components/layout/search-input";
import { formatDateOnly } from "@/lib/dates";
import type { ProjectExpense } from "@/lib/types";
import { SortableHead } from "@/components/layout/sortable-head";
import { byKeys, sortRows, type SortState } from "@/lib/table-sort";

function money(amount: number | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * The expenses filed against one project. Pressing a row opens the expense.
 *
 * `locked` is the project being billed: the API refuses these writes once the invoice is out, so
 * the table is shown as a table one reads rather than as rows that open a panel which could only
 * fail on save. The caller owns the flag — a second place deciding the same lock is a second
 * place to get it wrong.
 */
export function ProjectExpensesSection({
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
  // The crew sees what it paid, never what the client is charged for it.
  const crew = useIsCrewView();
  // A failed read is not a project without expenses: `data` is undefined either way, so asking
  // only `length === 0` would tell someone the receipts they filed are gone when the request
  // merely did not come back. The lock has nothing to do with it — a billed project's list can
  // fail to load too, and it still deserves the truth and a retry.
  // And `isError` alone is too wide: a failed background refetch keeps it true over rows
  // that are still right, so the panel only wins with nothing read at all (`!data`) or rows
  // left over from another query key (`isPlaceholderData`).
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useExpensesQuery(projectId);
  const remove = useDeleteExpense(projectId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectExpense | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ProjectExpense | undefined>(undefined);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const expenses = (data ?? []).filter(
    (expense) => (!taskId || expense.projectTaskId === taskId) && matchesSearch(search, expense.name, expense.description, expense.expenseTypeName, expense.projectTaskTitle),
  );

  // Both still check the lock although neither has a button when it is on: the guard is what
  // makes the panel unreachable, rather than it merely having nothing left to press.
  function openCreate() {
    if (locked) return;
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(expense: ProjectExpense) {
    if (locked) return;
    setEditing(expense);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Dépense supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette dépense.");
    }
  }

  const createButton = locked ? undefined : (
    <Button onClick={openCreate}>
      <Plus />
      Nouvelle dépense
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Dépenses</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui a été payé pour ce projet, avec les reçus.
          </p>
        </div>
        {createButton}
      </div>

      {(data?.length ?? 0) > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une dépense…" />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Dépenses indisponibles"
          fallback="Les dépenses de ce projet n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Aucune dépense"
          description="Les permis, la location de conteneur, le stationnement : tout ce qui sort de votre poche pour ce projet."
          action={createButton}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Dépense" sortKey="nom" sort={sort} onSort={setSort} />
                <SortableHead label="Type" sortKey="type" sort={sort} onSort={setSort} />
                <SortableHead label="Date" sortKey="date" sort={sort} onSort={setSort} className="w-28" />
                <SortableHead label="Coût" sortKey="cout" sort={sort} onSort={setSort} className="w-28 text-right" />
                {!crew && <SortableHead label="Vendant" sortKey="vendant" sort={sort} onSort={setSort} className="w-28 text-right" />}
                <SortableHead label="Photos" sortKey="photos" sort={sort} onSort={setSort} className="w-20 text-center" />
                {!locked && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortRows(expenses, sort, byKeys((expense) => ({ nom: expense.name, type: expense.expenseTypeName, date: expense.spentOn, cout: expense.cost, vendant: expense.sellingPrice, photos: expense.photoCount }))).map((expense) => {
                const cells = (
                  <>
                    <TableCell className="font-medium">
                      {expense.name}
                      {!expense.isBillable && (
                        <Badge variant="outline" className="ml-2 font-normal">
                          Non facturé
                        </Badge>
                      )}
                      {expense.description && (
                        <div className="line-clamp-1 text-xs font-normal text-muted-foreground">
                          {expense.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{expense.expenseTypeName}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDateOnly(expense.spentOn)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {money(expense.cost)}
                    </TableCell>
                    {!crew && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {money(expense.sellingPrice)}
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      {expense.photoCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                          <ImageIcon className="size-3.5" />
                          {expense.photoCount}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {!locked && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(expense)}>
                              <Pencil />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(expense)}>
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
                  <TableRow key={expense.id}>{cells}</TableRow>
                ) : (
                  <ClickableRow
                    key={expense.id}
                    label={`Ouvrir la dépense ${expense.name}`}
                    onOpen={() => openEdit(expense)}
                  >
                    {cells}
                  </ClickableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* The lock is read on every render, not only when the control that opens these was drawn:
          a project can be invoiced from another tab while a panel stands open. */}
      <ExpenseFormSheet
        open={formOpen && !locked}
        onOpenChange={setFormOpen}
        projectId={projectId}
        expense={editing}
        defaultTaskId={taskId}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget) && !locked}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette dépense ?"
        description={`« ${deleteTarget?.name} » sera retirée du projet. Les photos restent dans votre bibliothèque.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
