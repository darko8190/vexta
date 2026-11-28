import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LabourEntryMode, NamedItem, ProjectAutoLine, ProjectAutoLineValues, ProjectSettings } from "@/lib/types";

const KEY = ["parametres-projets"];

/** Paramètres › Projets: the labour mode, the task types, the priorities and the automatic lines. */
export function useProjectSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<ProjectSettings>("parametres-projets"),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useSaveLabourMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (labourMode: LabourEntryMode) => api.put("parametres-projets/main-doeuvre", { labourMode }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** The two plain lists: « types » (task types) and « priorites » (project priorities). */
export type NamedList = "types" | "priorites";

export function useSaveNamedItem(list: NamedList) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id?: string; name: string }) =>
      id
        ? api.put<NamedItem>(`parametres-projets/${list}/${id}`, { name })
        : api.post<NamedItem>(`parametres-projets/${list}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteNamedItem(list: NamedList) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`parametres-projets/${list}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSaveAutoLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: ProjectAutoLineValues }) =>
      id
        ? api.put<ProjectAutoLine>(`parametres-projets/lignes-automatiques/${id}`, values)
        : api.post<ProjectAutoLine>("parametres-projets/lignes-automatiques", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAutoLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`parametres-projets/lignes-automatiques/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
