import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { PagedResult, ProjectRecord, ProjectStatus } from "@/lib/types";

export interface ProjectFormValues {
  clientId: string;
  poNumber?: string | null;
  description?: string;
  status: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  clientAddressId?: string | null;
  sameAddressAsClient: boolean;
  /** Ignored by the server when sameAddressAsClient is true. */
  siteAddressId?: string | null;
}

export function useProjectsQuery(page: number, search: string, clientId?: string, status?: ProjectStatus) {
  return useQuery({
    queryKey: ["projects", page, search, clientId, status],
    queryFn: () => api.get<PagedResult<ProjectRecord>>(`projects${buildQuery({ page, search, clientId, status })}`),
    placeholderData: (previous) => previous,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ProjectFormValues) => api.post<ProjectRecord>("projects", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: ProjectFormValues }) =>
      api.put<ProjectRecord>(`projects/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useProjectQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => api.get<ProjectRecord>(`projects/${id}`),
    enabled: Boolean(id),
  });
}
