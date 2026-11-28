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
  showAbout: boolean;
  showLogo: boolean;
  showHeadline: boolean;
  footerTitle: string | null;
  footerText: string | null;
  footerShowAddress: boolean;
  footerShowPhone: boolean;
  footerShowEmail: boolean;
}

/**
 * Everything the page has now, ready to send back. The page is saved whole, so every screen that
 * changes one part of it starts from this and replaces only its own part.
 */
export function pageValues(settings: PublicPageSettings): PublicPageValues {
  return {
    isPublished: settings.isPublished,
    headline: settings.headline,
    about: settings.about,
    contactNote: settings.contactNote,
    showProducts: settings.showProducts,
    showJobs: settings.showJobs,
    showForms: settings.showForms,
    acceptsOrders: settings.acceptsOrders,
    requiresOnlinePayment: settings.requiresOnlinePayment,
    style: settings.style,
    showAbout: settings.showAbout,
    showLogo: settings.showLogo,
    showHeadline: settings.showHeadline,
    footerTitle: settings.footerTitle,
    footerText: settings.footerText,
    footerShowAddress: settings.footerShowAddress,
    footerShowPhone: settings.footerShowPhone,
    footerShowEmail: settings.footerShowEmail,
  };
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
