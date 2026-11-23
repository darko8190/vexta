import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProjectExtraCharge } from "@/lib/types";

export interface ExtraChargeFormValues {
  name: string;
  description: string | null;
  cost: number | null;
  sellingPrice: number | null;
  chargedOn: string | null;
}

/**
 * The list and the project's summary both go stale on every write: a charge moves a badge and
 * two figures in the cost table, and leaving those behind is how a page ends up showing a total
 * that nothing on screen adds up to.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "extra-charges"] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "summary"] });
}

export function useExtraChargesQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "extra-charges"],
    queryFn: () => api.get<ProjectExtraCharge[]>(`projects/${projectId}/extra-charges`),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useSaveExtraCharge(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: ExtraChargeFormValues }) =>
      id
        ? api.put<ProjectExtraCharge>(`projects/${projectId}/extra-charges/${id}`, values)
        : api.post<ProjectExtraCharge>(`projects/${projectId}/extra-charges`, values),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

export function useDeleteExtraCharge(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${projectId}/extra-charges/${id}`),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}
