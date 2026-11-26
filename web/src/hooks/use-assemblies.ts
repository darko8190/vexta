import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AssemblyItem {
  id?: string;
  productId: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  purchasePrice: number | null;
  unitPrice: number;
}

export interface Assembly {
  id: string;
  number: number;
  name: string;
  description: string | null;
  unitCost: number;
  unitPrice: number;
  itemCount: number;
  projectCount: number;
  items: AssemblyItem[];
  updatedAt: string;
}

export interface AssemblyFormValues {
  name: string;
  description: string | null;
  items: AssemblyItem[];
}

export interface ProjectAssemblyLine {
  id: string;
  projectId: string;
  assemblyId: string | null;
  assemblyNumber: number | null;
  name: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  installedOn: string | null;
  projectTaskId: string | null;
  projectTaskTitle: string | null;
  createdAt: string;
}

export interface ProjectAssemblyValues {
  assemblyId: string | null;
  name: string | null;
  quantity: number;
  unitCost: number | null;
  unitPrice: number | null;
  installedOn: string | null;
  projectTaskId: string | null;
}

/** AS-0001. */
export function formatAssemblyNumber(n: number): string {
  return `AS-${String(n).padStart(4, "0")}`;
}

export function useAssembliesQuery(search = "") {
  return useQuery({
    queryKey: ["assemblies", search],
    queryFn: () => api.get<Assembly[]>(`assemblages${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    placeholderData: (previous) => previous,
  });
}

export function useSaveAssembly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: AssemblyFormValues }) =>
      id ? api.put<Assembly>(`assemblages/${id}`, values) : api.post<Assembly>("assemblages", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assemblies"] }),
  });
}

export function useDeleteAssembly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`assemblages/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assemblies"] }),
  });
}

function invalidateProject(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
  queryClient.invalidateQueries({ queryKey: ["assemblies"] });
}

export function useProjectAssembliesQuery(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "assemblies"],
    queryFn: () => api.get<ProjectAssemblyLine[]>(`projects/${projectId}/assemblages`),
  });
}

export function useSaveProjectAssembly(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: ProjectAssemblyValues }) =>
      id
        ? api.put<ProjectAssemblyLine>(`projects/${projectId}/assemblages/${id}`, values)
        : api.post<ProjectAssemblyLine>(`projects/${projectId}/assemblages`, values),
    onSuccess: () => invalidateProject(queryClient, projectId),
  });
}

export function useDeleteProjectAssembly(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${projectId}/assemblages/${id}`),
    onSuccess: () => invalidateProject(queryClient, projectId),
  });
}
