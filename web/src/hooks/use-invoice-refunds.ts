import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { InvoiceRefunds, SaveInvoiceRefundValues } from "@/lib/types";

/**
 * A refund moves four things: what is left settled on the invoice, the invoice's own status —
 * the API takes it off Payée once the arithmetic says so — the payments panel beside it, and
 * the company-wide list of what has been given back.
 *
 * All four are invalidated. A panel that still says "payée" above a refund somebody just
 * entered is the disagreement that makes people stop trusting the screen.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>, invoiceId: string) {
  queryClient.invalidateQueries({ queryKey: ["invoices", "remboursements", invoiceId] });
  queryClient.invalidateQueries({ queryKey: ["invoices", "paiements", invoiceId] });
  queryClient.invalidateQueries({ queryKey: ["invoices"] });
  queryClient.invalidateQueries({ queryKey: ["remboursements"] });
}

export function useInvoiceRefundsQuery(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["invoices", "remboursements", invoiceId],
    queryFn: () => api.get<InvoiceRefunds>(`invoices/${invoiceId}/remboursements`),
    enabled: Boolean(invoiceId),
  });
}

export function useCreateInvoiceRefund(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveInvoiceRefundValues) =>
      api.post<InvoiceRefunds>(`invoices/${invoiceId}/remboursements`, values),
    onSuccess: (state) => {
      // The endpoint answers with the whole state, so the panel is right before the refetch
      // lands — and the refetch still happens, because the invoice's status changed too.
      queryClient.setQueryData(["invoices", "remboursements", invoiceId], state);
      invalidate(queryClient, invoiceId);
    },
  });
}

export function useDeleteInvoiceRefund(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<InvoiceRefunds>(`invoices/${invoiceId}/remboursements/${id}`),
    onSuccess: (state) => {
      queryClient.setQueryData(["invoices", "remboursements", invoiceId], state);
      invalidate(queryClient, invoiceId);
    },
  });
}
