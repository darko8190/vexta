import { useQuery } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { ExpenseFilters, ExpenseList } from "@/lib/types";

/**
 * Every expense the company has filed, across its jobs.
 *
 * Named apart from useExpensesQuery, which answers about one project: this is the same rows
 * asked the other way round, and one hook that did both would need a parameter whose absence
 * silently changed the question.
 *
 * The totals come back with the page and are over the whole filtered set, not over the rows on
 * screen — see ExpensesController. Adding up a page would look like an answer and be the wrong
 * one.
 */
export function useAllExpensesQuery(page: number, filters: ExpenseFilters) {
  return useQuery({
    queryKey: ["depenses", page, filters],
    queryFn: () =>
      api.get<ExpenseList>(
        `depenses${buildQuery({
          page,
          search: filters.search || undefined,
          type: filters.type || undefined,
          du: filters.du || undefined,
          au: filters.au || undefined,
          projet: filters.projet || undefined,
          statut: filters.statut || undefined,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });
}
