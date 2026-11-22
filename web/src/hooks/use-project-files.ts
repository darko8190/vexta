import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProjectDocument, ProjectNote, SaveProjectDocumentValues } from "@/lib/types";

export interface SaveProjectNoteValues {
  body: string;
}

/**
 * The project's summary counts the documents and the notes together on the rail's badge, so
 * every write here invalidates it alongside the list. Leaving it stale is how a tab ends up
 * saying "2" over a list of three.
 */
function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  resource: "documents" | "notes",
) {
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, resource] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "summary"] });
}

/** The job's files. Their links are signed on the way out and expire, hence no caching of them. */
export function useProjectDocumentsQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "documents"],
    queryFn: () => api.get<ProjectDocument[]>(`projects/${projectId}/documents`),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useSaveProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveProjectDocumentValues }) =>
      id
        ? api.put<ProjectDocument>(`projects/${projectId}/documents/${id}`, values)
        : api.post<ProjectDocument>(`projects/${projectId}/documents`, values),
    onSuccess: () => invalidate(queryClient, projectId, "documents"),
  });
}

export function useDeleteProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${projectId}/documents/${id}`),
    onSuccess: () => invalidate(queryClient, projectId, "documents"),
  });
}

/** The internal thread, newest first. Staff only, which the API enforces for reading too. */
export function useProjectNotesQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "notes"],
    queryFn: () => api.get<ProjectNote[]>(`projects/${projectId}/notes`),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useSaveProjectNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveProjectNoteValues }) =>
      id
        ? api.put<ProjectNote>(`projects/${projectId}/notes/${id}`, values)
        : api.post<ProjectNote>(`projects/${projectId}/notes`, values),
    onSuccess: () => invalidate(queryClient, projectId, "notes"),
  });
}

export function useDeleteProjectNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${projectId}/notes/${id}`),
    onSuccess: () => invalidate(queryClient, projectId, "notes"),
  });
}
