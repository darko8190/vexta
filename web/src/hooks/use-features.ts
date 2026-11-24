import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FeatureRecord } from "@/lib/types";

export interface SaveFeatureValues {
  key: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  isPublished: boolean;
}

/** The whole catalogue, for the super admin's own screen. */
export function useFeaturesQuery() {
  return useQuery({
    queryKey: ["admin", "features"],
    queryFn: () => api.get<FeatureRecord[]>("admin/fonctionnalites"),
  });
}

export function useSaveFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveFeatureValues }) =>
      id
        ? api.put<FeatureRecord>(`admin/fonctionnalites/${id}`, values)
        : api.post<FeatureRecord>("admin/fonctionnalites", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
      // A feature's name shows inside every plan that includes it.
      queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
  });
}

export function useDeleteFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`admin/fonctionnalites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
  });
}

/**
 * What the company signed in is allowed to do.
 *
 * Read to decide what to draw, never to decide what to allow: every endpoint behind a feature
 * checks it again for itself, because a browser is a place where anything can be made to
 * return true.
 */
export function useActiveFeaturesQuery(enabled = true) {
  return useQuery({
    queryKey: ["features", "active"],
    queryFn: () => api.get<string[]>("fonctionnalites"),
    enabled,
    // Rarely changes, and a plan edited while somebody is signed in reaches them on their next
    // visit rather than mid-sentence.
    staleTime: 5 * 60 * 1000,
  });
}

export function useHasFeature(key: string) {
  const { data } = useActiveFeaturesQuery();
  return data?.includes(key) ?? false;
}

/** The keys the application itself checks. Mirrors FeatureKeys on the server. */
export const FEATURE_OCR = "ocr";
export const FEATURE_AI = "ia";
export const FEATURE_PAYMENTS = "paiements";
