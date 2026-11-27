import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** A line every new invoice starts with: an administration fee, an environmental charge. */
export interface InvoiceAutoFee {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  isTaxable: boolean;
  isActive: boolean;
  sortOrder: number;
}

export type InvoiceAutoFeeValues = Omit<InvoiceAutoFee, "id" | "sortOrder">;

export function useInvoiceAutoFeesQuery(enabled = true) {
  return useQuery({
    queryKey: ["frais-automatiques"],
    queryFn: () => api.get<InvoiceAutoFee[]>("frais-automatiques"),
    enabled,
  });
}

export function useSaveInvoiceAutoFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: InvoiceAutoFeeValues }) =>
      id ? api.put<InvoiceAutoFee>(`frais-automatiques/${id}`, values) : api.post<InvoiceAutoFee>("frais-automatiques", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["frais-automatiques"] }),
  });
}

export function useDeleteInvoiceAutoFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`frais-automatiques/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["frais-automatiques"] }),
  });
}
