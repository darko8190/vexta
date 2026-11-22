import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProjectMaterial, SaveProjectMaterialValues } from "@/lib/types";

/**
 * Both the list and the project's own summary are invalidated by every write: a material
 * changes a badge and two figures in the cost table, and leaving those stale is how a page ends
 * up showing a total that nothing on screen adds up to.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "materials"] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "summary"] });
}

export function useProjectMaterialsQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "materials"],
    queryFn: () => api.get<ProjectMaterial[]>(`projects/${projectId}/materials`),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useCreateProjectMaterial(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveProjectMaterialValues) =>
      api.post<ProjectMaterial>(`projects/${projectId}/materials`, values),
    onSuccess: (created) => {
      // The saved row is put in the cache before the refetch lands. The table drops its draft
      // line the moment the POST answers, and without this the row someone just typed would
      // blink out of existence until the server came back.
      queryClient.setQueryData<ProjectMaterial[]>(["projects", projectId, "materials"], (previous) =>
        previous ? [...previous, created] : [created],
      );
      invalidate(queryClient, projectId);
    },
  });
}

export function useUpdateProjectMaterial(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: SaveProjectMaterialValues }) =>
      api.put<ProjectMaterial>(`projects/${projectId}/materials/${id}`, values),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

export function useDeleteProjectMaterial(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${projectId}/materials/${id}`),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}
