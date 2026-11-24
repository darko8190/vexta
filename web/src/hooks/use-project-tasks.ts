import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ProjectTask,
  ProjectTaskStatus,
  ProjectTaskTotals,
  SaveProjectTaskValues,
  TaskAssignables,
} from "@/lib/types";

/**
 * The list and the project's summary are both invalidated by every write: a task changes the
 * badge on the rail, and a badge that disagrees with the list under it is the kind of small
 * wrongness that makes people stop trusting the counts.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "taches"] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "summary"] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "taches", "totaux"] });
}

export function useProjectTasksQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "taches"],
    queryFn: () => api.get<ProjectTask[]>(`projects/${projectId}/taches`),
    enabled: Boolean(projectId) && enabled,
  });
}

/**
 * Who a task can be handed to. Fetched only when a form is open: it is two lists nobody needs
 * to read the tasks, and the staff list changes far less often than the tasks do.
 */
export function useTaskAssignablesQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "taches", "assignables"],
    queryFn: () => api.get<TaskAssignables>(`projects/${projectId}/taches/assignables`),
    enabled: Boolean(projectId) && enabled,
    // The crew does not change while a task is being written.
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProjectTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveProjectTaskValues) =>
      api.post<ProjectTask>(`projects/${projectId}/taches`, values),
    onSuccess: (created) => {
      queryClient.setQueryData<ProjectTask[]>(["projects", projectId, "taches"], (previous) =>
        previous ? [...previous, created] : [created],
      );
      invalidate(queryClient, projectId);
    },
  });
}

export function useUpdateProjectTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: SaveProjectTaskValues }) =>
      api.put<ProjectTask>(`projects/${projectId}/taches/${id}`, values),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

/**
 * Moving a task along, which is the one change an employee may make to one. Its own mutation
 * rather than a full save: ticking a task off must not need the whole form, and sending the
 * whole record back would be a 403 for the person most likely to be ticking it.
 */
export function useChangeTaskStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProjectTaskStatus }) =>
      api.patch<ProjectTask>(`projects/${projectId}/taches/${id}/statut`, { status }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ProjectTask[]>(["projects", projectId, "taches"], (previous) =>
        previous?.map((task) => (task.id === updated.id ? updated : task)),
      );
      invalidate(queryClient, projectId);
    },
  });
}

export function useDeleteProjectTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${projectId}/taches/${id}`),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

/**
 * The money on the job, broken down by task.
 *
 * Managers only, and asked for only when the panel that shows it is open: the row carries what
 * the company paid beside what it charges, and four grouped reads is more than the task list
 * needs to draw itself.
 */
export function useProjectTaskTotalsQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "taches", "totaux"],
    queryFn: () => api.get<ProjectTaskTotals[]>(`projects/${projectId}/taches/totaux`),
    enabled: Boolean(projectId) && enabled,
  });
}
