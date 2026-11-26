import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { PagedResult } from "@/lib/types";

export type EquipmentUnit = "Heure" | "Jour" | "Semaine" | "Unite";
export type EquipmentStatus = "Disponible" | "EnReparation" | "HorsService";

export const equipmentUnitLabels: Record<EquipmentUnit, string> = {
  Heure: "heure",
  Jour: "jour",
  Semaine: "semaine",
  Unite: "unité",
};

export const equipmentStatusLabels: Record<EquipmentStatus, string> = {
  Disponible: "Disponible",
  EnReparation: "En réparation",
  HorsService: "Hors service",
};

/** EQ-0001. */
export function formatEquipmentNumber(n: number): string {
  return `EQ-${String(n).padStart(4, "0")}`;
}

export interface Equipment {
  id: string;
  number: number;
  name: string;
  description: string | null;
  serialNumber: string | null;
  unit: EquipmentUnit;
  costRate: number | null;
  sellingRate: number | null;
  status: EquipmentStatus;
  isRented: boolean;
  notes: string | null;
  /** Jobs it has been used on, and its total use in its unit. */
  projectCount: number;
  totalQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentFormValues {
  name: string;
  description: string | null;
  serialNumber: string | null;
  unit: EquipmentUnit;
  costRate: number | null;
  sellingRate: number | null;
  status: EquipmentStatus;
  isRented: boolean;
  notes: string | null;
}

export interface ProjectEquipmentLine {
  id: string;
  projectId: string;
  equipmentId: string | null;
  name: string;
  unit: EquipmentUnit;
  quantity: number;
  costRate: number | null;
  sellingRate: number | null;
  usedOn: string | null;
  notes: string | null;
  projectTaskId: string | null;
  projectTaskTitle: string | null;
  cost: number;
  selling: number;
  createdAt: string;
}

export interface ProjectEquipmentFormValues {
  equipmentId: string | null;
  name: string | null;
  unit: EquipmentUnit | null;
  quantity: number;
  costRate: number | null;
  sellingRate: number | null;
  usedOn: string | null;
  notes: string | null;
  projectTaskId: string | null;
}

export function useEquipmentListQuery(page: number, search: string, pageSize?: number) {
  return useQuery({
    queryKey: ["equipment", page, search, pageSize],
    queryFn: () => api.get<PagedResult<Equipment>>(`equipements${buildQuery({ page, search, pageSize })}`),
    placeholderData: (previous) => previous,
  });
}

export function useSaveEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: EquipmentFormValues }) =>
      id ? api.put<Equipment>(`equipements/${id}`, values) : api.post<Equipment>("equipements", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["equipment"] }),
  });
}

export function useDeleteEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`equipements/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["equipment"] }),
  });
}

/**
 * A line moves the section's badge, the cost table and possibly the project's state (work on a
 * job « À faire » starts it), so the whole project is refreshed, not only the list.
 */
function invalidateProject(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
  queryClient.invalidateQueries({ queryKey: ["equipment"] });
}

export function useProjectEquipmentQuery(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "equipment"],
    queryFn: () => api.get<ProjectEquipmentLine[]>(`projects/${projectId}/equipment`),
  });
}

export function useSaveProjectEquipment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: ProjectEquipmentFormValues }) =>
      id
        ? api.put<ProjectEquipmentLine>(`projects/${projectId}/equipment/${id}`, values)
        : api.post<ProjectEquipmentLine>(`projects/${projectId}/equipment`, values),
    onSuccess: () => invalidateProject(queryClient, projectId),
  });
}

export function useDeleteProjectEquipment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${projectId}/equipment/${id}`),
    onSuccess: () => invalidateProject(queryClient, projectId),
  });
}
