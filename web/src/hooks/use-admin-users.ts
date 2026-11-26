import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { PagedResult } from "@/lib/types";

/** An account as the platform's list shows it. */
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  homeTenantId: string | null;
  /** The space the account lives in: their company, or their personal space. */
  homeName: string | null;
  homeKind: "Business" | "Personal" | null;
  /** How many spaces they can open, their own included. */
  spaceCount: number;
  createdAt: string;
}

export function useAdminUsersQuery(page: number, search: string) {
  return useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () => api.get<PagedResult<AdminUser>>(`admin/utilisateurs${buildQuery({ page, search })}`),
    placeholderData: (previous) => previous,
  });
}

/** Deletes the account and its personal space. Company files keep their records. */
export function useDeleteAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`admin/utilisateurs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
  });
}
