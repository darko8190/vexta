import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PublicPageSettings, PublicPageStyle } from "@/lib/types";

export interface PublicPageValues {
  isPublished: boolean;
  headline: string | null;
  about: string | null;
  contactNote: string | null;
  showProducts: boolean;
  showJobs: boolean;
  showForms: boolean;
  acceptsOrders: boolean;
  requiresOnlinePayment: boolean;
  style: PublicPageStyle;
}

export function usePublicPageQuery() {
  return useQuery({
    queryKey: ["company", "public-page"],
    queryFn: () => api.get<PublicPageSettings>("company/public-page"),
  });
}

export function useSavePublicPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: PublicPageValues) => api.put<PublicPageSettings>("company/public-page", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company", "public-page"] }),
  });
}
