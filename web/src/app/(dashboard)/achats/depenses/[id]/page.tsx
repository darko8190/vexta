"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Pencil, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { ExpenseFormSheet } from "@/components/projects/detail/expense-form-sheet";
import { useCanCreate } from "@/hooks/use-can-create";
import { useExpenseQuery, useSetExpenseStatus } from "@/hooks/use-expenses";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import { expenseStatusBadgeVariant, expenseStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatProjectNumber, type ExpenseStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const statuses = Object.keys(expenseStatusLabels) as ExpenseStatus[];

/**
 * Pattern 2 — Detail / Record. One expense: the receipt it was filed with, its figures, and its
 * state with the office, moved from the top in one choice.
 */
export default function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // The project travels in the query string, which is read inside a boundary.
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ExpenseDetail params={params} />
    </Suspense>
  );
}

function ExpenseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = useSearchParams().get("projet") ?? undefined;
  const canManage = useCanCreate();
  const { data, isLoading, isError } = useExpenseQuery(projectId, id);
  const setStatus = useSetExpenseStatus(projectId ?? "");
  const [editing, setEditing] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (isError || !data || !projectId) {
    return (
      <EmptyState
        icon={Receipt}
        title="Dépense introuvable"
        description="Cette dépense n'existe plus, ou vous n'y avez pas accès."
        action={
          <Link href="/achats" className={cn(buttonVariants())}>
            Retour aux achats
          </Link>
        }
      />
    );
  }

  const { expense, photos } = data;

  async function change(next: ExpenseStatus) {
    try {
      await setStatus.mutateAsync({ id, status: next });
      toast.success(`Dépense ${expenseStatusLabels[next].toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de changer l'état.");
    }
  }

  return (
    <div>
      <Link
        href="/achats"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Achats
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <Select value={expense.status} onValueChange={(value) => value && void change(value as ExpenseStatus)}>
                <SelectTrigger size="sm" aria-label="État de la dépense" className="min-w-36" disabled={setStatus.isPending}>
                  <SelectValue>{(value: ExpenseStatus) => expenseStatusLabels[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {expenseStatusLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={expenseStatusBadgeVariant[expense.status]}>{expenseStatusLabels[expense.status]}</Badge>
            )}
            <Badge variant="secondary">{expense.expenseTypeName}</Badge>
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{expense.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href={`/projets/${expense.projectId}`} className="underline-offset-4 hover:underline">
              {formatProjectNumber(expense.projectNumber)}
            </Link>
            {expense.clientName && ` · ${expense.clientName}`}
            {expense.projectTaskTitle && ` · ${expense.projectTaskTitle}`}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil />
            Modifier
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Reçu">
          <h2 className="mb-3 text-base font-semibold text-foreground">Reçu</h2>
          {photos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              Aucune photo de reçu sur cette dépense.
            </p>
          ) : (
            <div className="grid gap-4">
              {photos.map((photo) =>
                photo.url && photo.contentType.startsWith("image/") ? (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring storage URL */}
                    <img
                      src={photo.url}
                      alt={`Reçu : ${photo.fileName}`}
                      className="max-h-[70vh] w-full rounded-lg border border-border bg-muted object-contain"
                    />
                  </a>
                ) : (
                  <a
                    key={photo.id}
                    href={photo.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted"
                  >
                    <FileText className="size-4" />
                    {photo.fileName}
                  </a>
                ),
              )}
            </div>
          )}
        </section>

        <dl className="h-fit space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Date</dt>
            <dd className="tabular-nums">{formatDateOnly(expense.spentOn)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Coût</dt>
            <dd className="font-medium tabular-nums">{expense.cost == null ? "—" : formatAmount(expense.cost)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Facturé au client</dt>
            <dd className="tabular-nums">{expense.sellingPrice == null ? "—" : formatAmount(expense.sellingPrice)}</dd>
          </div>
          {expense.description && (
            <div>
              <dt className="mb-1 text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-line">{expense.description}</dd>
            </div>
          )}
        </dl>
      </div>

      {editing && (
        <ExpenseFormSheet open onOpenChange={(open) => !open && setEditing(false)} projectId={projectId} expense={expense} />
      )}
    </div>
  );
}
