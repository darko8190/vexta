import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ApplicationEligibility,
  MyApplication,
  PersonalProfile,
  SavePersonalProfileValues,
} from "@/lib/types";

/**
 * Somebody's own CV and the applications it has sent.
 *
 * Its own key, not under a tenant's: this record belongs to the person. Switching from a
 * personal space into a company must not invalidate it, and it reads the same from either.
 */
const KEY = ["mon-profil"];

export function usePersonalProfileQuery(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<PersonalProfile>("mon-profil"),
    enabled,
  });
}

export function useSavePersonalProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SavePersonalProfileValues) =>
      api.put<PersonalProfile>("mon-profil", values),
    onSuccess: (profile) => {
      // Written straight in rather than refetched: the response is the saved record, and the
      // completeness flag on it is what the apply button reads.
      queryClient.setQueryData(KEY, profile);
      void queryClient.invalidateQueries({ queryKey: ["candidatures"] });
    },
  });
}

export function useMyApplicationsQuery(enabled = true) {
  return useQuery({
    queryKey: [...KEY, "candidatures"],
    queryFn: () => api.get<MyApplication[]>("mon-profil/candidatures"),
    enabled,
  });
}

/**
 * Whether this account may apply to a posting, and what is missing if not.
 *
 * Asked before the button is offered so somebody is told what to fill in, rather than refused
 * after writing a covering note.
 */
export function useApplicationEligibilityQuery(slug: string, jobPostingId: string | null) {
  return useQuery({
    queryKey: ["candidatures", "admissibilite", slug, jobPostingId],
    queryFn: () =>
      api.get<ApplicationEligibility>(
        `candidatures/admissibilite?slug=${encodeURIComponent(slug)}&offre=${jobPostingId}`,
      ),
    enabled: Boolean(jobPostingId),
  });
}

export function useApplyToJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: {
      slug: string;
      jobPostingId: string;
      coverNote: string | null;
      answers: { fieldId: string; value: string | null; mediaAssetId: string | null }[];
    }) => api.post<{ message: string }>("candidatures", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["candidatures"] });
      void queryClient.invalidateQueries({ queryKey: [...KEY, "candidatures"] });
    },
  });
}
