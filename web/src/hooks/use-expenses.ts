import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ExpenseType, ProjectExpense, ProjectExpenseDetail } from "@/lib/types";

export interface ExpenseFormValues {
  name: string;
  description: string | null;
  expenseTypeId: string;
  cost: number | null;
  sellingPrice: number | null;
  spentOn: string | null;
  /** The whole set, in order: what is sent replaces what the expense had. */
  mediaAssetIds: string[];
  /** Optional: the task on this job it belongs to. */
  projectTaskId: string | null;
}

/**
 * Both the list and the project's own summary are invalidated by every write: an expense
 * changes a badge and two figures in the cost table, and leaving those stale is how a page ends
 * up showing a total that nothing on screen adds up to.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "expenses"] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "summary"] });
  queryClient.invalidateQueries({ queryKey: ["expense-types"] });
  // The company-wide list in Achats reads the same rows under its own key. Without this, an
  // expense filed on a project is missing from the list that is meant to show every one of
  // them, and the only way to see it is to reload the page.
  queryClient.invalidateQueries({ queryKey: ["depenses"] });
}

export function useExpensesQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "expenses"],
    queryFn: () => api.get<ProjectExpense[]>(`projects/${projectId}/expenses`),
    enabled: Boolean(projectId) && enabled,
  });
}

/** The expense with its photographs. Their links are signed on the way out and expire. */
export function useExpenseQuery(projectId: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "expenses", id],
    queryFn: () => api.get<ProjectExpenseDetail>(`projects/${projectId}/expenses/${id}`),
    enabled: Boolean(projectId) && Boolean(id),
  });
}

export function useSaveExpense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: ExpenseFormValues }) =>
      id
        ? api.put<ProjectExpenseDetail>(`projects/${projectId}/expenses/${id}`, values)
        : api.post<ProjectExpenseDetail>(`projects/${projectId}/expenses`, values),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

export function useDeleteExpense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${projectId}/expenses/${id}`),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

export function useExpenseTypesQuery() {
  return useQuery({
    queryKey: ["expense-types"],
    queryFn: () => api.get<ExpenseType[]>("expense-types"),
  });
}

/** Creating a type that already exists returns the existing one rather than failing. */
export function useCreateExpenseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<ExpenseType>("expense-types", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expense-types"] }),
  });
}
