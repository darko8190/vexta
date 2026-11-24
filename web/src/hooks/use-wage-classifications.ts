import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SaveWageClassificationValues, WageClassification } from "@/lib/types";

/**
 * The company's pay classifications and their steps. Read by the settings card that manages
 * them and by the project form that picks one, which share this cache.
 */
export function useWageClassificationsQuery() {
  return useQuery({
    queryKey: ["classements"],
    queryFn: () => api.get<WageClassification[]>("classements"),
  });
}

export function useSaveWageClassification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveWageClassificationValues }) =>
      id
        ? api.put<WageClassification>(`classements/${id}`, values)
        : api.post<WageClassification>("classements", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classements"] }),
  });
}

export function useDeleteWageClassification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`classements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classements"] });
      // The jobs that named it lose the name.
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
