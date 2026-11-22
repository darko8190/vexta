import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { PagedResult, TenantRecord, TenantSubscriptionStatus } from "@/lib/types";

export interface CreateTenantValues {
  companyName: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPassword: string;
}

/**
 * Omitting kind lists both, which is what the dashboard tile counts. The admin page asks for one
 * at a time so each table pages on its own — a shared page number would make "next" on one list
 * skip rows in the other.
 */
export function useTenantsQuery(page: number, search: string, kind?: "Business" | "Personal") {
  return useQuery({
    queryKey: ["tenants", page, search, kind ?? "all"],
    queryFn: () => api.get<PagedResult<TenantRecord>>(`admin/tenants${buildQuery({ page, search, kind })}`),
    placeholderData: (previous) => previous,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CreateTenantValues) => api.post<TenantRecord>("admin/tenants", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useUpdateTenantSubscriptionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TenantSubscriptionStatus }) =>
      api.patch(`admin/tenants/${id}/subscription-status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

/**
 * Sets what the space is allowed to do, not what it pays: Stripe is untouched, so a running
 * subscription keeps charging whatever it charges.
 */
export function useUpdateTenantPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, planId }: { id: string; planId: string | null }) =>
      api.patch(`admin/tenants/${id}/plan`, { planId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });
}
