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
  /**
   * The company asked to stop and is seeing out the period it has paid for. Not the same as a
   * cancelled subscription: the space still works, and the button offers to resume.
   */
  cancelAtPeriodEnd: boolean;
  /**
   * When the free trial runs out, and how many days are left. Both null outside a trial, so the
   * banner has one thing to test rather than a status string to interpret.
   */
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
}

/**
 * One query key for the whole app: the settings page and the subscription gate read the same
 * state, so entering the app costs a single request and paying refreshes both at once.
 */
/**
 * `enabled` so a caller that draws on every page can stay silent where there is no company to
 * bill. A personal space, a customer and a super admin outside a tenant all get 404 here, and a
 * failed request on every page load is noise in the console and in the logs.
 */
export function useBillingStateQuery(enabled = true) {
  return useQuery({
    queryKey: ["billing-state"],
    queryFn: () => api.get<BillingState>("billing/state"),
    enabled,
  });
}
