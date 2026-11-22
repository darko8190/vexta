import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PricePolicy } from "@/lib/types";

export interface SavePricePolicyValues {
  name: string;
  marginPercent: number;
  description: string | null;
  isDefault: boolean;
}

/**
 * The company's policies. Off for a personal space and for anyone who may not read them, so
 * the settings page does not open with a request it knows will be refused.
 */
export function usePricePoliciesQuery(enabled = true) {
  return useQuery({
    queryKey: ["price-policies"],
    queryFn: () => api.get<PricePolicy[]>("price-policies"),
    enabled,
  });
}

/**
 * Saving a policy can move the default, which lives in the billing settings — so both queries
 * are refreshed rather than leaving the Facturation section quoting a policy that no longer
 * holds it.
 */
export function useSavePricePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SavePricePolicyValues }) =>
      id
        ? api.put<PricePolicy>(`price-policies/${id}`, values)
        : api.post<PricePolicy>("price-policies", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-policies"] });
      queryClient.invalidateQueries({ queryKey: ["billing-settings"] });
    },
  });
}

export function useDeletePricePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`price-policies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-policies"] });
      queryClient.invalidateQueries({ queryKey: ["billing-settings"] });
    },
  });
}
