import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PlatformSettings } from "@/lib/types";

export interface UpdatePlatformSettingsValues {
  mailgunApiKey?: string;
  mailgunDomain?: string;
  mailgunFromEmail?: string;
  mailgunFromName?: string;
  mailgunRegion?: string;
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  stripeWebhookSecret?: string;
  stripeMonthlyPriceId?: string;
}

export function usePlatformSettingsQuery() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.get<PlatformSettings>("admin/settings"),
  });
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: UpdatePlatformSettingsValues) => api.put<void>("admin/settings", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "settings"] }),
  });
}
