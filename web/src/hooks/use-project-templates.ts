import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** A kind of job kept to start projects from. */
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  lineCount: number;
  subtotal: number;
  updatedAt: string;
}

export type ProjectTemplateLineKind = "Tache" | "Materiel" | "Equipement" | "Assemblage" | "Frais";

export interface ProjectTemplateLine {
  id: string;
  kind: ProjectTemplateLineKind;
  description: string;
  unit: string | null;
  quantity: number;
  unitCost: number | null;
  unitPrice: number;
}

export function useProjectTemplatesQuery(enabled = true) {
  return useQuery({
    queryKey: ["modeles-projet"],
    queryFn: () => api.get<ProjectTemplate[]>("modeles-projet"),
    enabled,
  });
}

export function useProjectTemplateQuery(id: string | null) {
  return useQuery({
    queryKey: ["modeles-projet", id],
    queryFn: () => api.get<{ template: ProjectTemplate; lines: ProjectTemplateLine[] }>(`modeles-projet/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveProjectAsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) =>
      api.post<ProjectTemplate>(`projects/${projectId}/modele`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["modeles-projet"] }),
  });
}

export function useDeleteProjectTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`modeles-projet/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["modeles-projet"] }),
  });
}
