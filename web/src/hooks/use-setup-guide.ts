import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** "oui" or "non" to a step that asks a question first. */
export type GuideAnswer = "oui" | "non";

/**
 * Where the owner is in the setup guide. The server keeps it as given, so adding a step only
 * means adding it to the list in guide-steps.tsx.
 */
export interface SetupGuideState {
  /** Answers to the yes/no questions, by step key. */
  answers: Record<string, GuideAnswer>;
  /** The steps gone through (saved, answered or passed), by key. */
  seen: string[];
  /** The step to come back to. */
  current?: string;
  /** Set when the owner hid the guide's banner without finishing. */
  closedAt?: string;
}

export const emptyGuideState: SetupGuideState = { answers: {}, seen: [] };

export function useSetupGuideQuery(enabled = true) {
  return useQuery({
    queryKey: ["company", "guide"],
    queryFn: async () => {
      const result = await api.get<{ state: Partial<SetupGuideState> | null }>("company/guide");
      return result.state ? { ...emptyGuideState, ...result.state } : null;
    },
    enabled,
  });
}

export function useSaveSetupGuide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (state: SetupGuideState) => api.put("company/guide", { state }),
    // Written into the cache first: the guide moves on at once, and the request catches up.
    onMutate: (state) => queryClient.setQueryData(["company", "guide"], state),
  });
}
