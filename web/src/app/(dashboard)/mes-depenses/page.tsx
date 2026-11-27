"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { SearchInput } from "@/components/layout/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { api } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import { expenseStatusBadgeVariant, expenseStatusLabels } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { formatProjectNumber, type ExpenseList } from "@/lib/types";

/**
 * The expenses this person entered, on every job: what they paid, for what, and whether the
 * office approved it. Added from the job itself, in its Dépenses tab.
 */
export default function MyExpensesPage() {
  const [search, setSearch] = useState("");
  const term = useDebouncedValue(search);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["depenses", "mes", term],
    queryFn: () =>
      api.get<ExpenseList>(`depenses?mes=true&page=1&pageSize=100${term ? `&search=${encodeURIComponent(term)}` : ""}`),
  });
  const items = data?.page.items ?? [];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Mes dépenses"
        description="Ce que vous avez payé pour les travaux. Ajoutez une dépense depuis le projet, dans son onglet Dépenses."
      />
      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une dépense…" />
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={term ? "Aucune dépense ne correspond" : "Aucune dépense"}
          description="Les dépenses que vous ajoutez sur vos projets apparaissent ici."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dépense</TableHead>
                <TableHead>Projet</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="font-medium">
                    {expense.name}
                    <div className="text-xs font-normal text-muted-foreground">{expense.expenseTypeName}</div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/projets/${expense.projectId}`} className="underline-offset-4 hover:underline">
                      {formatProjectNumber(expense.projectNumber)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{expense.clientName}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{expense.spentOn ? formatDateOnly(expense.spentOn) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{expense.cost != null ? formatAmount(expense.cost) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={expenseStatusBadgeVariant[expense.status]}>{expenseStatusLabels[expense.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
