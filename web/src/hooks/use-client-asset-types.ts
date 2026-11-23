import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ClientAssetType, SaveClientAssetTypeValues } from "@/lib/types";

/**
 * The company's kinds of asset: Véhicule, Maison, Bloc appartements, Machinerie.
 *
 * One list for the whole company, cached under its own key: it is read by every asset form and
 * by the project form's asset picker, and refetching it per panel would be three requests to
 * draw one dropdown.
 */
export function useClientAssetTypesQuery() {
  return useQuery({
    queryKey: ["types-actifs"],
    queryFn: () => api.get<ClientAssetType[]>("types-actifs"),
  });
}

/**
 * Adds a kind from the dropdown that needed it.
 *
 * The API returns the existing row when the name is already on the list rather than refusing,
 * so typing a kind that exists quietly picks it — see ClientAssetTypesController.Create.
 */
export function useCreateClientAssetType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveClientAssetTypeValues) =>
      api.post<ClientAssetType>("types-actifs", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["types-actifs"] });
      // The asset lists group by kind, so a new one changes their order.
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateClientAssetType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: SaveClientAssetTypeValues }) =>
      api.put<ClientAssetType>(`types-actifs/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["types-actifs"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useDeleteClientAssetType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`types-actifs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["types-actifs"] }),
  });
}
