import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentMethod, RefundList } from "@/lib/types";

/**
 * Everything the company has given back, across every invoice.
 *
 * Read-only, like the payments list beside it. A refund is given against the invoice it belongs
 * to — that is where what can still be given back is worked out, and where the card that took
 * the money is known — so a form here could only be a second way to do the same thing.
 */
export function useAllRefundsQuery(
  page: number,
  search: string,
  filters: { clientId?: string; method?: PaymentMethod; from?: string; to?: string } = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (search.trim()) params.set("recherche", search.trim());
  if (filters.clientId) params.set("client", filters.clientId);
  if (filters.method) params.set("mode", filters.method);
  if (filters.from) params.set("du", filters.from);
  if (filters.to) params.set("au", filters.to);

  return useQuery({
    queryKey: ["remboursements", page, search, filters],
    queryFn: () => api.get<RefundList>(`remboursements?${params}`),
    placeholderData: (previous) => previous,
  });
}
