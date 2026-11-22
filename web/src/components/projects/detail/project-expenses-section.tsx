"use client";

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
import { ExpenseFormSheet } from "@/components/projects/detail/expense-form-sheet";
import { useDeleteExpense, useExpensesQuery } from "@/hooks/use-expenses";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import type { ProjectExpense } from "@/lib/types";

function money(amount: number | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** The expenses filed against one project. Pressing a row opens the expense. */
export function ProjectExpensesSection({ projectId }: { projectId: string }) {
  const { data, isLoading } = useExpensesQuery(projectId);
  const remove = useDeleteExpense(projectId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectExpense | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ProjectExpense | undefined>(undefined);

  const expenses = data ?? [];

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(expense: ProjectExpense) {
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

  const createButton = (
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
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
                <TableHead>Dépense</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-28 text-right">Coût</TableHead>
                <TableHead className="w-28 text-right">Vendant</TableHead>
                <TableHead className="w-20 text-center">Photos</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <ClickableRow
                  key={expense.id}
                  label={`Ouvrir la dépense ${expense.name}`}
                  onOpen={() => openEdit(expense)}
                >
                  <TableCell className="font-medium">
                    {expense.name}
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
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {money(expense.sellingPrice)}
                  </TableCell>
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
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ExpenseFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        projectId={projectId}
        expense={editing}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette dépense ?"
        description={`« ${deleteTarget?.name} » sera retirée du projet. Les photos restent dans votre bibliothèque.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
