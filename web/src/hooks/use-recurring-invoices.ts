import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";

/** An invoice issued again every period, copied from a model invoice. */
export interface RecurringInvoice {
  id: string;
  clientId: string;
  clientName: string;
  sourceInvoiceId: string;
  sourceInvoiceNumber: string;
  intervalMonths: number;
  nextIssueDate: string;
  endDate: string | null;
  autoSend: boolean;
  isActive: boolean;
  /** Invoices issued since the schedule was last set. */
  periods: number;
  lastInvoiceId: string | null;
  lastInvoiceNumber: string | null;
  lastIssuedAt: string | null;
  /** Why the last one stayed a draft although it was to be sent. */
  lastProblem: string | null;
}

export interface SaveRecurringInvoiceValues {
  sourceInvoiceId: string;
  intervalMonths: number;
  nextIssueDate: string;
  endDate: string | null;
  autoSend: boolean;
}

export function useRecurringInvoicesQuery(invoiceId?: string) {
  return useQuery({
    queryKey: ["invoices", "recurrences", invoiceId ?? "all"],
    queryFn: () => api.get<RecurringInvoice[]>(`invoices/recurrences${buildQuery({ invoiceId })}`),
  });
}

export function useSaveRecurringInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveRecurringInvoiceValues }) =>
      id
        ? api.put<RecurringInvoice>(`invoices/recurrences/${id}`, values)
        : api.post<RecurringInvoice>("invoices/recurrences", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices", "recurrences"] }),
  });
}

export function useDeleteRecurringInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`invoices/recurrences/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices", "recurrences"] }),
  });
}

export const recurrenceIntervals = [1, 2, 3, 6, 12] as const;

export function recurrenceLabel(months: number): string {
  if (months === 1) return "Chaque mois";
  if (months === 3) return "Chaque trimestre";
  if (months === 6) return "Aux six mois";
  if (months === 12) return "Chaque année";
  return `Aux ${months} mois`;
}
