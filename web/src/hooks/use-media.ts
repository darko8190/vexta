import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import { prepareUpload } from "@/lib/compress-upload";
import type { MediaAssetRecord, PagedResult } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function useMediaQuery(page: number, search: string) {
  return useQuery({
    queryKey: ["media", page, search],
    queryFn: () =>
      api.get<PagedResult<MediaAssetRecord>>(`media${buildQuery({ page, search })}`),
  });
}

interface UploadUrl {
  objectKey: string;
  uploadUrl: string;
}

/**
 * Four steps: the file is compressed where it already is, the API signs a short-lived URL, the
 * browser PUTs the bytes straight to R2, and only then is the row written. A failed transfer
 * therefore leaves nothing in the library.
 *
 * The encoding has to be settled before the URL is signed — it is part of the signature, and R2
 * rejects a PUT whose headers do not match what was signed.
 */
export function useUploadMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const prepared = await prepareUpload(file);

      const { objectKey, uploadUrl } = await api.post<UploadUrl>("media/upload-url", {
        fileName: file.name,
        contentType: prepared.contentType,
        sizeBytes: prepared.storedSize,
        contentEncoding: prepared.contentEncoding,
      });

      const upload = await fetch(uploadUrl, {
        method: "PUT",
        body: prepared.body,
        headers: {
          "Content-Type": prepared.contentType,
          ...(prepared.contentEncoding ? { "Content-Encoding": prepared.contentEncoding } : {}),
        },
      });

      if (!upload.ok) {
        // Almost always the bucket's CORS policy, which has to allow PUT from this origin and
        // list both Content-Type and Content-Encoding under AllowedHeaders.
        throw new Error(`Le transfert vers R2 a échoué (${upload.status}).`);
      }

      return api.post<MediaAssetRecord>("media/confirm", {
        objectKey,
        fileName: file.name,
        contentType: prepared.contentType,
        sizeBytes: prepared.storedSize,
        originalSizeBytes: prepared.originalSize,
        contentEncoding: prepared.contentEncoding,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });
}

export function useRenameMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fileName }: { id: string; fileName: string }) =>
      api.patch<MediaAssetRecord>(`media/${id}`, { fileName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });
}

export function useDeleteMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`media/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });
}

/** Asked for on demand: the link is short-lived, so it is fetched at the moment of opening. */
export function useMediaLink() {
  return useMutation({
    mutationFn: (id: string) => api.get<{ url: string }>(`media/${id}/link`),
  });
}
