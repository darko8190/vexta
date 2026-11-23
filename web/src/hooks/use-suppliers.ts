import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  GoodsReceipt,
  GoodsReceiptDetail,
  OutstandingLine,
  PagedResult,
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderStatus,
  SaveGoodsReceiptValues,
  SavePurchaseOrderValues,
  SaveSupplierValues,
  Supplier,
} from "@/lib/types";

/**
 * Suppliers, orders and deliveries.
 *
 * One key prefix across all three, because a delivery changes an order's status and an order
 * changes a supplier's open count. Invalidating only the list that was written would leave the
 * other two screens stating something that stopped being true in the same request.
 */
const KEY = ["approvisionnement"];

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: KEY });
}

// ---- Fournisseurs ----

export function useSuppliersQuery(search: string, includeInactive = false) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("recherche", search.trim());
  if (includeInactive) params.set("inactifs", "true");
  const suffix = params.toString();

  return useQuery({
    queryKey: [...KEY, "fournisseurs", search, includeInactive],
    queryFn: () => api.get<Supplier[]>(`fournisseurs${suffix ? `?${suffix}` : ""}`),
  });
}

export function useSaveSupplier() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, values }: { id: string | null; values: SaveSupplierValues }) =>
      id ? api.put<Supplier>(`fournisseurs/${id}`, values) : api.post<Supplier>("fournisseurs", values),
    onSuccess: refresh,
  });
}

export function useDeleteSupplier() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`fournisseurs/${id}`),
    onSuccess: refresh,
  });
}

// ---- Commandes ----

export function usePurchaseOrdersQuery(
  page: number,
  search: string,
  filters: { supplierId?: string; projectId?: string; status?: PurchaseOrderStatus } = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (search.trim()) params.set("recherche", search.trim());
  if (filters.supplierId) params.set("fournisseur", filters.supplierId);
  if (filters.projectId) params.set("projet", filters.projectId);
  if (filters.status) params.set("statut", filters.status);

  return useQuery({
    queryKey: [...KEY, "commandes", page, search, filters],
    queryFn: () => api.get<PagedResult<PurchaseOrder>>(`commandes?${params}`),
    // Keeps the rows on screen while the next page loads, like every other list here.
    placeholderData: (previous) => previous,
  });
}

export function usePurchaseOrderQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "commande", id],
    queryFn: () => api.get<PurchaseOrderDetail>(`commandes/${id}`),
    enabled: Boolean(id),
  });
}

/** What is still owed, so the delivery form opens with the right numbers rather than the ordered ones. */
export function useOutstandingLinesQuery(orderId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "restant", orderId],
    queryFn: () => api.get<OutstandingLine[]>(`commandes/${orderId}/restant`),
    enabled: Boolean(orderId),
  });
}

export function useSavePurchaseOrder() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, values }: { id: string | null; values: SavePurchaseOrderValues }) =>
      id
        ? api.put<PurchaseOrderDetail>(`commandes/${id}`, values)
        : api.post<PurchaseOrderDetail>("commandes", values),
    onSuccess: refresh,
  });
}

export function useSetPurchaseOrderStatus() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PurchaseOrderStatus }) =>
      api.post<PurchaseOrderDetail>(`commandes/${id}/statut`, { status }),
    onSuccess: refresh,
  });
}

export function useDeletePurchaseOrder() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`commandes/${id}`),
    onSuccess: refresh,
  });
}

// ---- Réceptions ----

export function useGoodsReceiptsQuery(
  page: number,
  search: string,
  filters: { orderId?: string; supplierId?: string } = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (search.trim()) params.set("search", search.trim());
  if (filters.orderId) params.set("commande", filters.orderId);
  if (filters.supplierId) params.set("fournisseur", filters.supplierId);

  return useQuery({
    queryKey: [...KEY, "receptions", page, search, filters],
    queryFn: () => api.get<PagedResult<GoodsReceipt>>(`receptions?${params}`),
    placeholderData: (previous) => previous,
  });
}

export function useGoodsReceiptQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "reception", id],
    queryFn: () => api.get<GoodsReceiptDetail>(`receptions/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateGoodsReceipt() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (values: SaveGoodsReceiptValues) => api.post<GoodsReceiptDetail>("receptions", values),
    onSuccess: refresh,
  });
}

export function useDeleteGoodsReceipt() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`receptions/${id}`),
    onSuccess: refresh,
  });
}
