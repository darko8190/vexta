"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const KEY = ["company", "menu"];

/** The key of a screen's sub-tab: the screen (its SectionNav label) and the tab. */
export function subTabKey(screen: string, tab: string) {
  return `${screen}::${tab}`;
}

/**
 * The tabs and sub-tabs the company hid, for everyone in it. Only a company's own staff have
 * one: a customer, a personal space and a super admin outside a company get an empty set.
 */
export function useHiddenNavigation() {
  const { user } = useAuth();
  const enabled =
    Boolean(user) &&
    user!.role !== "Client" &&
    user!.tenantKind === "Business" &&
    (user!.role !== "SuperAdmin" || user!.isImpersonating);

  const { data } = useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => api.get<{ keys: string[] }>("company/menu"),
    staleTime: 5 * 60_000,
  });

  return new Set(enabled ? (data?.keys ?? []) : []);
}

export function useSaveHiddenNavigation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keys: string[]) => api.put("company/menu", { keys }),
    onMutate: async (keys) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      queryClient.setQueryData(KEY, { keys });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
