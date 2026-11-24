import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProjectDocument, ProjectNote, SaveProjectDocumentValues } from "@/lib/types";

export interface SaveProjectNoteValues {
  body: string;
}

/**
 * What the files and the notes hang off: a project, or a quote — which is the project before it
 * is sold, and is filed and discussed the same way. A bare string is a project id, which is how
 * every project screen already calls these hooks.
 */
export interface FileOwner {
  kind: "projects" | "soumissions";
  id: string;
}

type OwnerInput = string | FileOwner | undefined;

function ownerOf(input: OwnerInput): FileOwner | undefined {
  if (!input) return undefined;
  return typeof input === "string" ? { kind: "projects", id: input } : input;
}

function pathOf(owner: FileOwner) {
  return `${owner.kind}/${owner.id}`;
}

/** Under each owner's own key, so a quote's writes refresh the quote's badges and nothing else. */
function keyOf(owner: FileOwner | undefined, resource: "documents" | "notes") {
  return owner?.kind === "soumissions"
    ? ["quotes", "files", owner.id, resource]
    : ["projects", owner?.id, resource];
}

/**
 * The owner's summary counts the documents and the notes together on the rail's badge, so
 * every write here invalidates it alongside the list. Leaving it stale is how a tab ends up
 * saying "2" over a list of three.
 */
function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  owner: FileOwner,
  resource: "documents" | "notes",
) {
  queryClient.invalidateQueries({ queryKey: keyOf(owner, resource) });
  queryClient.invalidateQueries({
    queryKey: owner.kind === "soumissions" ? ["quotes", "summary", owner.id] : ["projects", owner.id, "summary"],
  });
}

/** The files. Their links are signed on the way out and expire, hence no caching of them. */
export function useProjectDocumentsQuery(input: OwnerInput, enabled = true) {
  const owner = ownerOf(input);
  return useQuery({
    queryKey: keyOf(owner, "documents"),
    queryFn: () => api.get<ProjectDocument[]>(`${pathOf(owner!)}/documents`),
    enabled: Boolean(owner) && enabled,
  });
}

export function useSaveProjectDocument(input: string | FileOwner) {
  const owner = ownerOf(input)!;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveProjectDocumentValues }) =>
      id
        ? api.put<ProjectDocument>(`${pathOf(owner)}/documents/${id}`, values)
        : api.post<ProjectDocument>(`${pathOf(owner)}/documents`, values),
    onSuccess: () => invalidate(queryClient, owner, "documents"),
  });
}

export function useDeleteProjectDocument(input: string | FileOwner) {
  const owner = ownerOf(input)!;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${pathOf(owner)}/documents/${id}`),
    onSuccess: () => invalidate(queryClient, owner, "documents"),
  });
}

/** The internal thread, newest first. Staff only, which the API enforces for reading too. */
export function useProjectNotesQuery(input: OwnerInput, enabled = true) {
  const owner = ownerOf(input);
  return useQuery({
    queryKey: keyOf(owner, "notes"),
    queryFn: () => api.get<ProjectNote[]>(`${pathOf(owner!)}/notes`),
    enabled: Boolean(owner) && enabled,
  });
}

export function useSaveProjectNote(input: string | FileOwner) {
  const owner = ownerOf(input)!;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveProjectNoteValues }) =>
      id
        ? api.put<ProjectNote>(`${pathOf(owner)}/notes/${id}`, values)
        : api.post<ProjectNote>(`${pathOf(owner)}/notes`, values),
    onSuccess: () => invalidate(queryClient, owner, "notes"),
  });
}

export function useDeleteProjectNote(input: string | FileOwner) {
  const owner = ownerOf(input)!;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${pathOf(owner)}/notes/${id}`),
    onSuccess: () => invalidate(queryClient, owner, "notes"),
  });
}
