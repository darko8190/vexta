import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { ClientRecord, ClientSummary, PagedResult } from "@/lib/types";

export interface ClientFormValues {
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  notes?: string;
}

export function useClientsQuery(page: number, search: string) {
  return useQuery({
    queryKey: ["clients", page, search],
    queryFn: () => api.get<PagedResult<ClientRecord>>(`clients${buildQuery({ page, search })}`),
    placeholderData: (previous) => previous,
  });
}

export function useClientSummaryQuery() {
  return useQuery({
    queryKey: ["clients", "summary"],
    queryFn: () => api.get<ClientSummary[]>("clients/summary"),
    staleTime: 60_000,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ClientFormValues) => api.post<ClientRecord>("clients", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: ClientFormValues }) =>
      api.put<ClientRecord>(`clients/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`clients/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}
