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
