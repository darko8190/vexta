import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentList, PaymentMethod } from "@/lib/types";

/**
 * Every payment the company has taken, across every invoice.
 *
 * Read-only on purpose. A payment is taken against the invoice it pays — that is where the
 * remainder is worked out and where the client's account is written — so a form here could only
 * ever be a second way to do the same thing, drifting from the first.
 */
export function useAllPaymentsQuery(
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
    queryKey: ["paiements", page, search, filters],
    queryFn: () => api.get<PaymentList>(`paiements?${params}`),
    placeholderData: (previous) => previous,
  });
}
