import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { InvoiceLine, InvoiceRecord, InvoiceStatus, PagedResult } from "@/lib/types";

export interface InvoiceFormValues {
  clientId: string;
  projectId?: string | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: string;
  notes?: string;
  /** Omitted on a new invoice means "take the project's answer, or the client's". */
  isTaxExempt?: boolean | null;
  lines: InvoiceLine[];
}

export function useInvoicesQuery(
  page: number,
  search: string,
  clientId?: string,
  status?: InvoiceStatus,
  projectId?: string,
) {
  return useQuery({
    queryKey: ["invoices", page, search, clientId, status, projectId],
    queryFn: () =>
      api.get<PagedResult<InvoiceRecord>>(
        `invoices${buildQuery({ page, search, clientId, status, projectId })}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useInvoiceQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["invoices", id],
    queryFn: () => api.get<InvoiceRecord>(`invoices/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: InvoiceFormValues) => api.post<InvoiceRecord>("invoices", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: InvoiceFormValues }) =>
      api.put<InvoiceRecord>(`invoices/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
