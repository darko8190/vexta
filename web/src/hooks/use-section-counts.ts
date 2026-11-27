import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** How many rows sit behind each sub-tab of Facturation, Achats, Approvisionnement and Temps. */
export interface SectionCounts {
  invoices: number;
  payments: number;
  credits: number;
  refunds: number;
  expenses: number;
  suppliers: number;
  purchaseOrders: number;
  goodsReceipts: number;
  timesheets: number;
  workDays: number;
  recurringInvoices: number;
}

/** One request for every badge; refreshed after any write by the query provider. */
export function useSectionCountsQuery(enabled = true) {
  return useQuery({
    queryKey: ["section-counts"],
    queryFn: () => api.get<SectionCounts>("compteurs"),
    enabled,
  });
}
