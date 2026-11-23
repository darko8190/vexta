import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReceiptReading, ReceiptScanAvailability } from "@/lib/types";

/**
 * Whether to offer the "lire le reçu" button at all.
 *
 * Three things can make it no — no key on the platform, no allowance in the plan, none left
 * this month — and the page does not need to know which: a button that cannot work is worse
 * than no button. The count is shown beside it so nobody is surprised by the last one.
 */
export function useReceiptScanAvailabilityQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "lecture-recu"],
    queryFn: () =>
      api.get<ReceiptScanAvailability>(`projects/${projectId}/expenses/lecture-recu`),
    enabled: Boolean(projectId),
  });
}

/**
 * Reads one receipt. Saves nothing — the answer fills the form and the person decides.
 *
 * The API answers 200 even when it read nothing, with a message to show: a red error in front
 * of somebody holding a receipt is a dead end rather than an instruction.
 */
export function useScanReceipt(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaAssetId: string) =>
      api.post<ReceiptReading>(`projects/${projectId}/expenses/lecture-recu`, { mediaAssetId }),
    // The allowance moved, and it is on screen beside the button.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "lecture-recu"] }),
  });
}
