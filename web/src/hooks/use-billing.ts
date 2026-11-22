import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TenantSubscriptionStatus } from "@/lib/types";

export interface BillingState {
  tenantName: string;
  kind: "Business" | "Personal";
  subscriptionStatus: TenantSubscriptionStatus;
  currentPeriodEnd: string | null;
  canManage: boolean;
  planName: string | null;
  planAmountCents: number | null;
  planCurrency: string | null;
}

/**
 * One query key for the whole app: the settings page and the subscription gate read the same
 * state, so entering the app costs a single request and paying refreshes both at once.
 */
export function useBillingStateQuery() {
  return useQuery({
    queryKey: ["billing-state"],
    queryFn: () => api.get<BillingState>("billing/state"),
  });
}
