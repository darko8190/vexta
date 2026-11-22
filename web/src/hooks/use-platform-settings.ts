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
  r2AccountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2Bucket?: string;
  /** An empty string clears it; omitting it leaves the stored value alone. */
  r2PublicBaseUrl?: string;
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

/**
 * Sends a real message. Mailgun can accept a key and still refuse the sending domain, so only
 * an actual send tells the super admin whether invitations will go out.
 */
export function useSendTestEmail() {
  return useMutation({
    mutationFn: (toEmail: string | null) =>
      api.post<{ message: string }>("admin/settings/mailgun/test", { toEmail }),
  });
}

/** Checks the stored R2 credentials against the bucket before anyone depends on them. */
export function useTestR2() {
  return useMutation({
    mutationFn: () => api.post<{ message: string }>("admin/settings/r2/test"),
  });
}

