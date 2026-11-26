"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Paperclip, Plus, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { ClickableRow } from "@/components/layout/clickable-row";
import { StatusPills, useStatusCountsQuery } from "@/components/layout/status-pills";
import { expenseStatusBadgeVariant, expenseStatusLabels } from "@/lib/labels";
import type { ExpenseStatus } from "@/lib/types";
import { Field, FieldLabel } from "@/components/ui/field";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PaginationBar } from "@/components/layout/pagination-bar";
import { SearchInput } from "@/components/layout/search-input";
import { ProjectPicker } from "@/components/invoices/project-picker";
import { ExpenseFormSheet } from "@/components/projects/detail/expense-form-sheet";
import { useCanCreate } from "@/hooks/use-can-create";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useExpenseTypesQuery } from "@/hooks/use-expenses";
import { useAllExpensesQuery } from "@/hooks/use-purchasing";
import { formatDateOnly } from "@/lib/dates";
import { formatAmount } from "@/lib/money";

/** Base UI needs a value for every item, and "" is not one. */
const ALL_TYPES = "tous";

/**
 * Every expense the company has filed, across its jobs.
 *
 * The same rows a project's own tab shows, asked the other way round. "Combien on a dépensé en
 * novembre" is a purchasing question, and answering it by opening forty projects is how nobody
 * ever answers it.
 *
 * Read-only. An expense is filed against the job it was spent on, because an expense with no
 * job is a cost nobody can charge for — so the way in is still the project, and this is the way
 * to look at them all.
 */
export function ExpensesSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const canCreate = useCanCreate();

  // An expense belongs to a job — that is what makes it chargeable — so filing one from the
  // company-wide list has to ask which one first. Two steps rather than a project field buried
  // in the expense form: the question is not optional, and a form that opens without it would
  // be a form whose first field decides what the rest of it means.
  const [pickOpen, setPickOpen] = useState(false);
  const [pickedProject, setPickedProject] = useState("");
  const [formProject, setFormProject] = useState<string | null>(null);

  const { data: types } = useExpenseTypesQuery();
  const [status, setStatus] = useState<ExpenseStatus | "">("");
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useAllExpensesQuery(page, {
    search: debouncedSearch,
    type,
    du: from,
    au: to,
    statut: status,
  });
  const { data: statusCounts } = useStatusCountsQuery("depenses", "depenses/statuts");
  const router = useRouter();

  const items = data?.page.items ?? [];
  const totals = data?.totals;
  const filtered = Boolean(debouncedSearch || type || from || to || status);

  /** Reset to the first page whenever the question changes: page 4 of a new filter is nowhere. */
  function change(apply: () => void) {
    apply();
    setPage(1);
  }

  const createButton = canCreate ? (
    <Button
      onClick={() => {
        setPickedProject("");
        setPickOpen(true);
      }}
    >
      <Plus />
      Nouvelle dépense
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Dépenses</h2>
          <p className="text-sm text-muted-foreground">
            Tout ce qui a été acheté ou payé sur vos chantiers, tous projets confondus.
          </p>
        </div>
        {createButton}
      </div>

      <StatusPills
        options={(Object.keys(expenseStatusLabels) as ExpenseStatus[]).map((value) => ({ value, label: expenseStatusLabels[value] }))}
        value={status}
        onChange={(next) => {
          setStatus(next);
          setPage(1);
        }}
        counts={statusCounts}
        allLabel="Toutes"
      />

      {/* Every filter carries a visible label, including the search: two labelled fields beside
          two unlabelled ones put the row on two different baselines, and the eye reads that as
          a mistake before it reads the filters. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field className="sm:col-span-2 lg:col-span-1">
          <FieldLabel htmlFor="expense-search">Rechercher</FieldLabel>
          <SearchInput
            id="expense-search"
            className="sm:w-full"
            value={search}
            onChange={(value) => change(() => setSearch(value))}
            placeholder="Nom, description, client…"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="expense-type">Type</FieldLabel>
          <Select
            value={type || ALL_TYPES}
            onValueChange={(value) =>
              change(() => setType(value === ALL_TYPES ? "" : (value ?? "")))
            }
          >
            <SelectTrigger id="expense-type" className="w-full">
              <SelectValue>
                {(value: string) =>
                  !value || value === ALL_TYPES
                    ? "Tous les types"
                    : (types?.find((candidate) => candidate.id === value)?.name ?? "Chargement…")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>Tous les types</SelectItem>
              {(types ?? []).map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="expense-from">Du</FieldLabel>
          <Input
            id="expense-from"
            type="date"
            value={from}
            onChange={(event) => change(() => setFrom(event.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="expense-to">Au</FieldLabel>
          <Input
            id="expense-to"
            type="date"
            value={to}
            onChange={(event) => change(() => setTo(event.target.value))}
          />
        </Field>
      </div>

      {/* Over everything the filters match, not over the page on screen — a total of twenty rows
          out of four hundred would look like an answer and be the wrong one. */}
      {totals && totals.count > 0 && (
        <dl className="mb-4 grid gap-4 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Dépenses</dt>
            <dd className="text-lg font-semibold text-foreground tabular-nums">{totals.count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Coût</dt>
            <dd className="text-lg font-semibold text-foreground tabular-nums">
              {formatAmount(totals.cost)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Facturé au client</dt>
            <dd className="text-lg font-semibold text-foreground tabular-nums">
              {formatAmount(totals.sellingPrice)}
            </dd>
          </div>
        </dl>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={error}
          title="Dépenses indisponibles"
          fallback="Les dépenses n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={filtered ? "Aucune dépense trouvée" : "Aucune dépense pour l'instant"}
          description={
            filtered
              ? "Essayez une autre période ou un autre type."
              : "Une dépense se rattache toujours à un projet, avec la photo du reçu."
          }
          action={filtered ? undefined : createButton}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dépense</TableHead>
                  {/* Hidden on narrow screens: what it was and what it cost are what the list
                      is read for, and the rest is one tap away on the project. */}
                  <TableHead className="hidden md:table-cell">Projet</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead className="text-right">Coût</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Facturé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((expense) => (
                  <ClickableRow
                    key={expense.id}
                    label={`Ouvrir la dépense ${expense.name}`}
                    onOpen={() => router.push(`/achats/depenses/${expense.id}?projet=${expense.projectId}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">{expense.name}</span>
                        {expense.photoCount > 0 && (
                          <span
                            className="flex items-center gap-0.5 text-xs text-muted-foreground"
                            title={expense.photoCount === 1 ? "1 reçu" : `${expense.photoCount} reçus`}
                          >
                            <Paperclip className="size-3" />
                            {expense.photoCount}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground md:hidden">
                        {expense.clientName}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Link
                        href={`/projets/${expense.projectId}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        P-{String(expense.projectNumber).padStart(4, "0")}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {expense.clientName}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">{expense.expenseTypeName}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                      {formatDateOnly(expense.spentOn)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={expenseStatusBadgeVariant[expense.status]}>{expenseStatusLabels[expense.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-foreground tabular-nums">
                      {expense.cost == null ? "—" : formatAmount(expense.cost)}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                      {expense.sellingPrice == null ? "—" : formatAmount(expense.sellingPrice)}
                    </TableCell>
                  </ClickableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar result={data?.page} onPageChange={setPage} />
        </>
      )}

      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sur quel projet ?</DialogTitle>
            <DialogDescription>
              Une dépense se facture au client du projet, alors il faut savoir lequel.
            </DialogDescription>
          </DialogHeader>

          <ProjectPicker id="expense-project" value={pickedProject} onChange={setPickedProject} />

          <DialogFooter>
            <Button
              disabled={!pickedProject}
              onClick={() => {
                setFormProject(pickedProject);
                setPickOpen(false);
              }}
            >
              Continuer
            </Button>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mounted only once a project is known, and dropped when it closes, so the next expense
          starts from an empty form rather than the last one abandoned. */}
      {formProject && (
        <ExpenseFormSheet
          open
          onOpenChange={(next) => !next && setFormProject(null)}
          projectId={formProject}
        />
      )}
    </div>
  );
}
