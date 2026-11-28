import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SaveTimesheetValues, TimesheetEntry } from "@/lib/types";

/**
 * The sheet and the project's own summary are both invalidated by every write: hours are a
 * badge on the tab and a revenue line in the cost table, and a stale one of either leaves the
 * page showing a total that the rows underneath no longer add up to.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "timesheets"] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "summary"] });
}

export function useTimesheetsQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "timesheets"],
    queryFn: () => api.get<TimesheetEntry[]>(`projects/${projectId}/timesheets`),
    enabled: Boolean(projectId) && enabled,
  });
}

/**
 * The hours are never sent: the server works them out from the four moments, because that
 * figure is what the project is billed from.
 */
export function useSaveTimesheet(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveTimesheetValues }) =>
      id
        ? api.put<TimesheetEntry>(`projects/${projectId}/timesheets/${id}`, values)
        : api.post<TimesheetEntry>(`projects/${projectId}/timesheets`, values),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

export function useDeleteTimesheet(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`projects/${projectId}/timesheets/${id}`),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

/** One rate on every labour entry of the job, from the totals table. */
export function useSetLabourRate(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hourlyRate: number) => api.put(`projects/${projectId}/timesheets/taux`, { hourlyRate }),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

/** My punch still open, on whatever job it is, or null. */
export function useMyPunchQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["punch", "mine"],
    queryFn: () => api.get<TimesheetEntry | null>(`projects/${projectId}/timesheets/punch`),
    enabled: Boolean(projectId) && enabled,
  });
}

export type PunchStep = "commencer" | "pause" | "continuer" | "terminer";

/** Commencer, Pause, Continuer, Terminer. */
export function usePunch(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ step, id, projectTaskId, note }: { step: PunchStep; id?: string; projectTaskId?: string | null; note?: string | null }) =>
      step === "commencer"
        ? api.post<TimesheetEntry>(`projects/${projectId}/timesheets/punch`, { projectTaskId: projectTaskId ?? null, note: note ?? null })
        : api.post<TimesheetEntry>(`projects/${projectId}/timesheets/punch/${id}/${step}`, step === "terminer" ? { note: note ?? null } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["punch"] });
      queryClient.invalidateQueries({ queryKey: ["moi"] });
      invalidate(queryClient, projectId);
    },
  });
}
