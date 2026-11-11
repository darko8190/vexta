import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { AddressRecord, AddressType, PagedResult } from "@/lib/types";

export interface AddressFormValues {
  clientId: string;
  type: AddressType;
  isPrimary: boolean;
  line1: string;
  line2?: string;
  city: string;
  province?: string;
  postalCode: string;
  country: string;
}

export function useAddressesQuery(page: number, search: string, clientId?: string) {
  return useQuery({
    queryKey: ["addresses", page, search, clientId],
    queryFn: () => api.get<PagedResult<AddressRecord>>(`addresses${buildQuery({ page, search, clientId })}`),
    placeholderData: (previous) => previous,
  });
}

export function useCreateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: AddressFormValues) => api.post<AddressRecord>("addresses", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: AddressFormValues }) =>
      api.put<AddressRecord>(`addresses/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`addresses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
