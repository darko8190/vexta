import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Gallery,
  GalleryDetail,
  PageSection,
  SaveGalleryImageValues,
  SaveGalleryValues,
  SavePageSectionValues,
} from "@/lib/types";

const KEY = ["galeries"] as const;

/**
 * One invalidate of the whole key.
 *
 * The list carries each gallery's cover and its count, so every write has to move the list and
 * the gallery together — a card showing four photographs next to a gallery holding six is the
 * kind of small wrongness that makes people stop trusting the screen.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: KEY });
}

export function useGalleriesQuery(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<Gallery[]>("galeries"),
    enabled,
  });
}

/** Undefined is "nothing to fetch", which is what a panel passes before a gallery is chosen. */
export function useGalleryQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => api.get<GalleryDetail>(`galeries/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateGallery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveGalleryValues) => api.post<GalleryDetail>("galeries", values),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateGallery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: SaveGalleryValues }) =>
      api.put<GalleryDetail>(`galeries/${id}`, values),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteGallery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`galeries/${id}`),
    onSuccess: () => {
      invalidate(queryClient);
      // A section of the page may have been pointing at it, and that section now points at
      // nothing. The builder should say so the moment it is opened.
      void queryClient.invalidateQueries({ queryKey: ["page-sections"] });
    },
  });
}

/**
 * The photographs, in the order they are to be shown.
 *
 * The whole list every time: what is sent replaces what the gallery had, which is what makes
 * reordering, captioning and removing one save rather than three endpoints.
 */
export function useSaveGalleryImages(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (images: SaveGalleryImageValues[]) =>
      api.put<GalleryDetail>(`galeries/${id}/images`, { images }),
    onSuccess: () => invalidate(queryClient),
  });
}

// ---- The page builder ----

export function usePageSectionsQuery(enabled = true) {
  return useQuery({
    queryKey: ["page-sections"],
    queryFn: () => api.get<PageSection[]>("company/sections"),
    enabled,
  });
}

export function useSavePageSections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sections: SavePageSectionValues[]) =>
      api.put<PageSection[]>("company/sections", { sections }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["page-sections"] }),
  });
}
