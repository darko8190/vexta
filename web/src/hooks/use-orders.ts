import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CustomerOrder,
  CustomerOrderDetail,
  CustomerOrderStatus,
  OrderEligibility,
  PlaceOrderLine,
  PlaceOrderResult,
} from "@/lib/types";

const KEY = ["commandes"] as const;

/**
 * One invalidate of the whole key.
 *
 * Every write moves both the list and the order under it — a status badge that disagrees with
 * the page it was opened from is the kind of small wrongness that makes people stop trusting
 * the screen.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: KEY });
}

export function useOrdersQuery(status: CustomerOrderStatus | "", search: string) {
  const query = new URLSearchParams();
  if (status) query.set("etat", status);
  if (search.trim()) query.set("recherche", search.trim());

  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  return useQuery({
    queryKey: [...KEY, "liste", status, search.trim()],
    queryFn: () => api.get<CustomerOrder[]>(`commandes-en-ligne${suffix}`),
    // The previous list stays on screen while a new filter loads. Searching is typing, and a
    // list that empties between keystrokes is a list nobody can aim at.
    placeholderData: (previous) => previous,
  });
}

/** Undefined is "nothing to fetch", which is what a panel passes before an order is chosen. */
export function useOrderQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => api.get<CustomerOrderDetail>(`commandes-en-ligne/${id}`),
    enabled: Boolean(id),
  });
}

export function useChangeOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CustomerOrderStatus }) =>
      api.put<CustomerOrderDetail>(`commandes-en-ligne/${id}/etat`, { status }),
    onSuccess: () => invalidate(queryClient),
  });
}

/**
 * The invoice drawn from an order: the same lines at the same prices, as a draft.
 *
 * The invoice list is invalidated too — a draft has just appeared in it, and somebody who goes
 * straight there expecting to find it should.
 */
export function useInvoiceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<CustomerOrderDetail>(`commandes-en-ligne/${id}/facture`, {}),
    onSuccess: () => {
      invalidate(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["factures"] });
    },
  });
}

// ---- The customer's side ----

/**
 * Whether this account may order from this company, and under what name.
 *
 * Asked only once a basket has something in it: a visitor who is reading a page has not yet
 * asked a question that needs answering.
 */
export function useOrderEligibilityQuery(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["boutique", "admissibilite", slug],
    queryFn: () =>
      api.get<OrderEligibility>(`boutique/admissibilite?slug=${encodeURIComponent(slug)}`),
    enabled,
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: {
      slug: string;
      lines: PlaceOrderLine[];
      note: string | null;
      contactPhone: string | null;
    }) => api.post<PlaceOrderResult>("boutique/commandes", values),
    onSuccess: () => {
      // Their own space has a new row in it, and so has the company's list for anybody who
      // happens to be looking at both.
      void queryClient.invalidateQueries({ queryKey: ["mon-espace", "commandes"] });
      invalidate(queryClient);
    },
  });
}

/**
 * Opens the payment page again for an order whose checkout was abandoned or expired.
 *
 * Each call makes a new Stripe session, because the old one does not live forever — which is
 * why coming back to pay is a POST and not a stored link.
 */
export function usePayOrder() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ url: string }>(`boutique/commandes/${id}/paiement`, {}),
  });
}

/**
 * Settles the order on the way back from Stripe, so the screen says so without waiting for the
 * webhook. The session id is not believed: the API asks Stripe about it.
 */
export function useConfirmOrderPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sessionId }: { id: string; sessionId: string | null }) =>
      api.post<{ paid: boolean }>(`boutique/commandes/${id}/confirmation`, { sessionId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mon-espace", "commandes"] });
      invalidate(queryClient);
    },
  });
}
