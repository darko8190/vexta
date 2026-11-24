import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { InvoiceCredits, SaveInvoiceCreditValues } from "@/lib/types";

/**
 * A credit note moves what the invoice still bills, its status — the API marks it Payée once
 * payments and credits together cover it — the payments panel's "reste à payer", and the
 * company-wide list. All of them are invalidated together.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>, invoiceId: string) {
  queryClient.invalidateQueries({ queryKey: ["invoices", "credits", invoiceId] });
  queryClient.invalidateQueries({ queryKey: ["invoices", "paiements", invoiceId] });
  queryClient.invalidateQueries({ queryKey: ["invoices"] });
  queryClient.invalidateQueries({ queryKey: ["credits"] });
}

export function useInvoiceCreditsQuery(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["invoices", "credits", invoiceId],
    queryFn: () => api.get<InvoiceCredits>(`invoices/${invoiceId}/credits`),
    enabled: Boolean(invoiceId),
  });
}

export function useCreateInvoiceCredit(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveInvoiceCreditValues) =>
      api.post<InvoiceCredits>(`invoices/${invoiceId}/credits`, values),
    onSuccess: (state) => {
      queryClient.setQueryData(["invoices", "credits", invoiceId], state);
      invalidate(queryClient, invoiceId);
    },
  });
}

export function useDeleteInvoiceCredit(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<InvoiceCredits>(`invoices/${invoiceId}/credits/${id}`),
    onSuccess: (state) => {
      queryClient.setQueryData(["invoices", "credits", invoiceId], state);
      invalidate(queryClient, invoiceId);
    },
  });
}
