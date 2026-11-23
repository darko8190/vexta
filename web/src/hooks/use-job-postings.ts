import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { JobPosting, JobPostingStatus, SaveJobPostingValues } from "@/lib/types";

const KEY = ["offres-emplois"];

/**
 * `enabled` is there for the badge on a rail, which is drawn before the section is opened. The
 * endpoint is the owner's, so an employee asking for it takes a 403 — a refusal the screen would
 * then have to explain for a number nobody asked to see.
 */
export function useJobPostingsQuery(status?: JobPostingStatus, enabled = true) {
  return useQuery({
    queryKey: [...KEY, status ?? "tous"],
    queryFn: () => api.get<JobPosting[]>(`offres-emplois${buildQuery({ statut: status })}`),
    enabled,
  });
}

export function useSaveJobPosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveJobPostingValues }) =>
      id
        ? api.put<JobPosting>(`offres-emplois/${id}`, values)
        : api.post<JobPosting>("offres-emplois", values),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteJobPosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`offres-emplois/${id}`),
    onSuccess: () => invalidate(queryClient),
  });
}

/**
 * The public page is invalidated too. A posting marked filled leaves the shop window, so the
 * preview of that window is stale the moment this list changes.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: KEY });
  void queryClient.invalidateQueries({ queryKey: ["company", "public-page"] });
}
