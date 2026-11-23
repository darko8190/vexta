import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminDashboardSummary, DashboardSummary } from "@/lib/types";

/**
 * The company's own figures, in one request.
 *
 * `enabled` is false for a customer and for a super admin outside a tenant: neither has a
 * company behind this screen, and asking would be a refusal on every page load.
 *
 * Refetched when the window comes back into focus. These are figures somebody leaves open on a
 * second monitor, and a month's billing that stopped updating at nine in the morning is worse
 * than one that says it is loading.
 */
export function useDashboardQuery(enabled = true) {
  return useQuery({
    queryKey: ["tableau-de-bord"],
    queryFn: () => api.get<DashboardSummary>("tableau-de-bord"),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}

/**
 * The platform's figures, for a super admin outside any tenant.
 *
 * `enabled` is false while impersonating: a super admin inside a company is acting as its owner
 * and gets that company's screen, not the platform's.
 */
export function useAdminDashboardQuery(enabled = true) {
  return useQuery({
    queryKey: ["admin", "tableau-de-bord"],
    queryFn: () => api.get<AdminDashboardSummary>("admin/tableau-de-bord"),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}
