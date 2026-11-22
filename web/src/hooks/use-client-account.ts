import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ClientAccount, ClientRecord, SaveAccountEntryValues } from "@/lib/types";

/**
 * One invalidate of the whole "clients" key, like the rest of the client hooks: the card shows
 * the balance, and a balance that disagrees with the lines under it is worse than no balance.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["clients"] });
}

export function useClientAccountQuery(clientId: string | undefined) {
  return useQuery({
    queryKey: ["clients", "compte", clientId],
    queryFn: () => api.get<ClientAccount>(`clients/${clientId}/compte`),
    enabled: Boolean(clientId),
  });
}

export function useCreateAccountEntry(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveAccountEntryValues) =>
      api.post(`clients/${clientId}/compte`, values),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteAccountEntry(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`clients/${clientId}/compte/${id}`),
    onSuccess: () => invalidate(queryClient),
  });
}

/**
 * Barring a client, and barring only their account. Two mutations rather than one with a flag:
 * they are two different decisions and the confirmation each one needs is different.
 *
 * Both answer with the updated client, which is written straight into the cache — the card at
 * the top of the page carries the badge that has just changed.
 */
export function useBlockClient(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ isBlocked, reason }: { isBlocked: boolean; reason: string | null }) =>
      api.put<ClientRecord>(`clients/${clientId}/blocage`, { isBlocked, reason }),
    onSuccess: (client) => {
      // Written straight into the cache as well as invalidated: the badge on the card is the
      // thing that just changed, and it should not wait for a round trip to say so.
      queryClient.setQueryData(["clients", "detail", clientId], client);
      invalidate(queryClient);
    },
  });
}

export function useBlockClientAccount(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ isBlocked, reason }: { isBlocked: boolean; reason: string | null }) =>
      api.put<ClientRecord>(`clients/${clientId}/blocage-compte`, { isBlocked, reason }),
    onSuccess: (client) => {
      queryClient.setQueryData(["clients", "detail", clientId], client);
      invalidate(queryClient);
    },
  });
}
