import { useQuery } from "@tanstack/react-query";

export interface Workspace {
  tenantId: string;
  name: string;
  kind: "Business" | "Personal";
  role: "SuperAdmin" | "TenantAdmin" | "TenantUser";
  isCurrent: boolean;
}

/**
 * Not through `api`, which goes to the generic proxy: the spaces list and the switch share a
 * route handler, because switching has to replace the session cookie.
 */
export function useWorkspacesQuery(enabled = true) {
  return useQuery({
    queryKey: ["workspaces"],
    enabled,
    queryFn: async (): Promise<Workspace[]> => {
      const response = await fetch("/api/auth/espaces", { cache: "no-store" });
      if (!response.ok) return [];
      return (await response.json()) as Workspace[];
    },
  });
}
