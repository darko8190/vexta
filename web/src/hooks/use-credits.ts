import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreditList } from "@/lib/types";

/**
 * Every credit note the company has issued, across every invoice.
 *
 * Read-only, like the payments and refunds beside it: a credit note is issued against the
 * invoice it reduces, which is where what can still be credited is known.
 */
export function useAllCreditsQuery(
  page: number,
  search: string,
  filters: { from?: string; to?: string } = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (search.trim()) params.set("recherche", search.trim());
  if (filters.from) params.set("du", filters.from);
  if (filters.to) params.set("au", filters.to);

  return useQuery({
    queryKey: ["credits", page, search, filters],
    queryFn: () => api.get<CreditList>(`credits?${params}`),
    placeholderData: (previous) => previous,
  });
}
