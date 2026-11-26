import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface McpKey {
  id: string;
  name: string;
  /** The first characters, to recognise a key; the rest is never shown again. */
  prefix: string;
  canWrite: boolean;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const key = ["mcp-keys"] as const;

export function useMcpKeysQuery(enabled = true) {
  return useQuery({ queryKey: key, queryFn: () => api.get<McpKey[]>("cles-mcp"), enabled });
}

/** Whether the company's plan includes MCP keys. */
export function useMcpAvailabilityQuery() {
  return useQuery({
    queryKey: ["mcp-keys", "disponibilite"],
    queryFn: () => api.get<{ included: boolean }>("cles-mcp/disponibilite"),
  });
}

export function useMcpEndpointQuery() {
  return useQuery({
    queryKey: ["mcp-endpoint"],
    queryFn: async () => {
      const response = await fetch("/api/mcp-endpoint");
      return ((await response.json()) as { url: string }).url;
    },
    staleTime: Infinity,
  });
}

/** The answer carries the key in full, once. */
export function useCreateMcpKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { name: string; canWrite: boolean }) =>
      api.post<{ key: McpKey; secret: string }>("cles-mcp", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useRevokeMcpKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`cles-mcp/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
