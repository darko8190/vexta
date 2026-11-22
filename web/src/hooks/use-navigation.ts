import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface NavigationItem {
  id: string;
  icon: string;
  title: string;
  href: string;
  children: NavigationItem[];
}

/**
 * The sidebar this company's plan defines, or an empty list when it defines none. Empty is not
 * an empty sidebar: the app falls back to its built-in menu, which is what keeps a company with
 * no plan — every tenant created by hand — able to reach anything at all.
 */
export function useNavigationQuery(enabled = true) {
  return useQuery({
    queryKey: ["navigation"],
    enabled,
    queryFn: () => api.get<NavigationItem[]>("navigation"),
  });
}
