import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { ClientAsset, SaveClientAssetValues } from "@/lib/types";

/**
 * One invalidate of the whole "clients" key, like the rest of the client hooks: the card at the
 * top of the page carries the count of assets in service, so a write moves the list and the
 * record together, and a badge that disagrees with the list under it is the kind of small
 * wrongness that makes people stop trusting the counts.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["clients"] });
}

export function useClientAssetsQuery(clientId: string | undefined, includeRetired = false) {
  return useQuery({
    queryKey: ["clients", "actifs", clientId, includeRetired],
    queryFn: () =>
      api.get<ClientAsset[]>(`clients/${clientId}/actifs${buildQuery({ inactifs: includeRetired })}`),
    enabled: Boolean(clientId),
  });
}

export function useCreateClientAsset(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveClientAssetValues) =>
      api.post<ClientAsset>(`clients/${clientId}/actifs`, values),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateClientAsset(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: SaveClientAssetValues }) =>
      api.put<ClientAsset>(`clients/${clientId}/actifs/${id}`, values),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteClientAsset(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`clients/${clientId}/actifs/${id}`),
    onSuccess: () => invalidate(queryClient),
  });
}
