import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ModuleRecord, PlanRecord, PublicPlan } from "@/lib/types";

/**
 * The public page caches the catalogue, so a save has to purge it. Failing to purge must not
 * fail the save: the change is already stored, it would just show up late.
 */
async function revalidatePublicSite() {
  try {
    await fetch("/api/catalog/revalidate", { method: "POST" });
  } catch {
    // Ignored on purpose — see above.
  }
}

export interface SaveModuleValues {
  icon: string;
  title: string;
  description: string;
  sortOrder: number;
  isPublished: boolean;
  navHref: string | null;
  parentModuleId: string | null;
  ownerOnly: boolean;
}

export interface SavePlanValues {
  name: string;
  description: string | null;
  amountCents: number;
  minUsers: number;
  maxUsers: number;
  sortOrder: number;
  isPublished: boolean;
  moduleIds: string[];
}

export function useModulesQuery() {
  return useQuery({
    queryKey: ["admin", "modules"],
    queryFn: () => api.get<ModuleRecord[]>("admin/modules"),
  });
}

export function useSaveModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveModuleValues }) =>
      id
        ? api.put<ModuleRecord>(`admin/modules/${id}`, values)
        : api.post<ModuleRecord>("admin/modules", values),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "modules"] });
      // A module's title and icon show inside every plan that includes it.
      queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
      // A module is also a menu entry now, so the sidebar it feeds is stale too.
      queryClient.invalidateQueries({ queryKey: ["navigation"] });
      await revalidatePublicSite();
    },
  });
}

export function useDeleteModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`admin/modules/${id}`),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "modules"] });
      await revalidatePublicSite();
    },
  });
}

export function usePlansQuery() {
  return useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => api.get<PlanRecord[]>("admin/plans"),
  });
}

export function useSavePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SavePlanValues }) =>
      id
        ? api.put<PlanRecord>(`admin/plans/${id}`, values)
        : api.post<PlanRecord>("admin/plans", values),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
      await revalidatePublicSite();
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`admin/plans/${id}`),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
      await revalidatePublicSite();
    },
  });
}

/** The published plans, as a visitor without a session sees them. */
export function usePublicPlansQuery() {
  return useQuery({
    queryKey: ["public", "plans"],
    queryFn: async (): Promise<PublicPlan[]> => {
      const response = await fetch("/api/catalog/plans");
      if (!response.ok) return [];
      return (await response.json()) as PublicPlan[];
    },
  });
}
