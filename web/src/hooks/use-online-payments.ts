import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { OnlinePaymentsState } from "@/lib/types";

const key = ["online-payments", "state"] as const;

/**
 * Where the company stands with its own Stripe account.
 *
 * Read to decide what the card says, never to decide what is allowed: the three endpoints behind
 * it check the plan for themselves, because a browser is a place where anything can be made to
 * return true.
 */
export function useOnlinePaymentsQuery(enabled = true) {
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<OnlinePaymentsState>("paiements-en-ligne/etat"),
    enabled,
  });
}

/**
 * Opens the company's Stripe account if it has none and sends the person to Stripe's own form.
 *
 * A full page assignment rather than a new tab: the flow comes back to Vexta by URL, and a tab
 * that returns to a page nobody is looking at is a company that has finished onboarding and
 * still sees "non branché".
 */
export function useStartStripeOnboarding() {
  return useMutation({
    mutationFn: () => api.post<{ url: string }>("paiements-en-ligne/onboarding"),
    onSuccess: (data) => window.location.assign(data.url),
  });
}

/** Asks Stripe where the account stands now, rather than trusting what was cached. */
export function useRefreshOnlinePayments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnlinePaymentsState>("paiements-en-ligne/actualiser"),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });
}

/**
 * A one-time link into the company's own Stripe dashboard. Opened in a new tab, unlike
 * onboarding: this one is somewhere to go and look, not a flow that comes back here.
 */
export function useStripeDashboardLink() {
  return useMutation({
    mutationFn: () => api.post<{ url: string }>("paiements-en-ligne/tableau-de-bord"),
    onSuccess: (data) => window.open(data.url, "_blank", "noopener,noreferrer"),
  });
}
