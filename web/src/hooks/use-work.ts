import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { ProjectTask, ProjectTaskStatus, SaveProjectTaskValues, WorkTask, WorkTimesheets } from "@/lib/types";

/** Every open task in the company. Omitting the status means everything not finished. */
export function useWorkTasksQuery(filters: {
  status?: ProjectTaskStatus;
  projectId?: string;
  employeeId?: string;
}) {
  const query = buildQuery({
    statut: filters.status,
    projet: filters.projectId,
    employe: filters.employeeId,
  });

  return useQuery({
    queryKey: ["travail", "taches", filters.status ?? "ouvertes", filters.projectId ?? "tous", filters.employeeId ?? "tous"],
    queryFn: () => api.get<WorkTask[]>(`travail/taches${query}`),
  });
}

/**
 * The hours filed in one period, across every job.
 *
 * The dates are sent as given and the server answers with the period it decided on, so a week
 * with no dates asked for is the company's week and not the browser's idea of one.
 */
export function useWorkTimesheetsQuery(filters: {
  from?: string;
  to?: string;
  employeeId?: string;
  projectId?: string;
}) {
  const query = buildQuery({
    du: filters.from,
    au: filters.to,
    employe: filters.employeeId,
    projet: filters.projectId,
  });

  return useQuery({
    queryKey: [
      "travail",
      "feuilles-de-temps",
      filters.from ?? "courante",
      filters.to ?? "courante",
      filters.employeeId ?? "tous",
      filters.projectId ?? "tous",
    ],
    queryFn: () => api.get<WorkTimesheets>(`travail/feuilles-de-temps${query}`),
    // Keeps last week's table on screen while this one loads, so moving between weeks does not
    // flash an empty state at somebody who is reading hours.
    placeholderData: (previous) => previous,
  });
}

/** Every task-shaped list on screen, refreshed after a write from the company-wide routes. */
function invalidateTasks(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["travail", "taches"] });
  queryClient.invalidateQueries({ queryKey: ["projects"] });
  queryClient.invalidateQueries({ queryKey: ["moi"] });
}

/** A task created or edited from Tâches et horaire: on a project or on none. */
export function useSaveWorkTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveProjectTaskValues }) =>
      id ? api.put<ProjectTask>(`taches/${id}`, values) : api.post<ProjectTask>("taches", values),
    onSuccess: () => invalidateTasks(queryClient),
  });
}

export function useChangeWorkTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProjectTaskStatus }) =>
      api.patch<ProjectTask>(`taches/${id}/statut`, { status }),
    onSuccess: () => invalidateTasks(queryClient),
  });
}

export function useDeleteWorkTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`taches/${id}`),
    onSuccess: () => invalidateTasks(queryClient),
  });
}
