import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type {
  ClientAddress,
  ClientContact,
  ClientRecord,
  ClientSummary,
  ClientType,
  PagedResult,
} from "@/lib/types";

export interface ClientFormValues {
  type: ClientType;
  companyName: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  taxId?: string | null;
  notes?: string | null;
  primaryAddress: Omit<ClientAddress, "id"> | null;
}

export interface ClientContactFormValues {
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export function useClientsQuery(page: number, search: string) {
  return useQuery({
    queryKey: ["clients", page, search],
    queryFn: () => api.get<PagedResult<ClientRecord>>(`clients${buildQuery({ page, search })}`),
    placeholderData: (previous) => previous,
  });
}

export function useClientQuery(id: string) {
  return useQuery({
    queryKey: ["clients", "detail", id],
    queryFn: () => api.get<ClientRecord>(`clients/${id}`),
    enabled: Boolean(id),
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

// ---- Contacts attached to a client ----

export function useClientContactsQuery(clientId: string) {
  return useQuery({
    queryKey: ["clients", "contacts", clientId],
    queryFn: () => api.get<ClientContact[]>(`clients/${clientId}/contacts`),
    enabled: Boolean(clientId),
  });
}

export function useSaveClientContact(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: ClientContactFormValues }) =>
      id
        ? api.put<ClientContact>(`clients/${clientId}/contacts/${id}`, values)
        : api.post<ClientContact>(`clients/${clientId}/contacts`, values),
    // The client record carries the contact count, so both have to be refreshed.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useDeleteClientContact(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`clients/${clientId}/contacts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}
