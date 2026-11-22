import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AccessGranted, Employee, EmployeeDetail, TeamList } from "@/lib/types";

const TEAM_KEY = ["team", "employees"];

export interface SaveEmployeeValues {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  phone: string | null;
}

export function useTeamQuery() {
  return useQuery({
    queryKey: TEAM_KEY,
    queryFn: () => api.get<TeamList>("employees"),
  });
}

export function useEmployeeQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...TEAM_KEY, id],
    queryFn: () => api.get<EmployeeDetail>(`employees/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveEmployeeValues }) =>
      id
        ? api.put<Employee>(`employees/${id}`, values)
        : api.post<Employee>("employees", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAM_KEY }),
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`employees/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAM_KEY }),
  });
}

/** Ticking the access box: creates the account and issues the first invitation. */
export function useGrantAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AccessGranted>(`employees/${id}/access`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAM_KEY }),
  });
}

/** Unticking it: the employee stays on file and the seat comes back. */
export function useRevokeAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`employees/${id}/access`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAM_KEY }),
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AccessGranted>(`employees/${id}/access/resend`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAM_KEY }),
  });
}
