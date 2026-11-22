import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { InvoicePayments, SaveInvoicePaymentValues } from "@/lib/types";

/**
 * A payment moves three things: what is paid on the invoice, the invoice's own status — the API
 * marks it Payée once the arithmetic says so — and, when it was charged to the account, the
 * client's balance. All three are invalidated, because a till that balances and a client card
 * that does not is the kind of disagreement nobody finds until month end.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>, invoiceId: string) {
  queryClient.invalidateQueries({ queryKey: ["invoices", "paiements", invoiceId] });
  queryClient.invalidateQueries({ queryKey: ["invoices"] });
  queryClient.invalidateQueries({ queryKey: ["clients"] });
}

export function useInvoicePaymentsQuery(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["invoices", "paiements", invoiceId],
    queryFn: () => api.get<InvoicePayments>(`invoices/${invoiceId}/paiements`),
    enabled: Boolean(invoiceId),
  });
}

export function useCreateInvoicePayment(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveInvoicePaymentValues) =>
      api.post<InvoicePayments>(`invoices/${invoiceId}/paiements`, values),
    onSuccess: (state) => {
      // The endpoint answers with the whole state, so the panel is right before the refetch
      // lands — and the refetch still happens, because the invoice's status changed too.
      queryClient.setQueryData(["invoices", "paiements", invoiceId], state);
      invalidate(queryClient, invoiceId);
    },
  });
}

export function useDeleteInvoicePayment(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<InvoicePayments>(`invoices/${invoiceId}/paiements/${id}`),
    onSuccess: (state) => {
      queryClient.setQueryData(["invoices", "paiements", invoiceId], state);
      invalidate(queryClient, invoiceId);
    },
  });
}
