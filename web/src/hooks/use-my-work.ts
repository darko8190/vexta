import { useQuery } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type { MyAssignments, MyWeek } from "@/lib/types";

/**
 * My hours for one week, across every job.
 *
 * <paramref name="week"/> is any day in the week being asked for; the server answers with the
 * Monday and the Sunday it decided on. Deliberately not worked out here: the week a sheet is
 * filed against is the company's week, and two places deciding where Monday falls is one too
 * many.
 */
export function useMyWeekQuery(week: string) {
  return useQuery({
    queryKey: ["moi", "heures", week],
    queryFn: () => api.get<MyWeek>(`moi/heures${buildQuery({ semaine: week })}`),
    // Keeps last week's table on screen while this one loads, so moving between weeks does not
    // flash an empty state at somebody who is reading their hours.
    placeholderData: (previous) => previous,
  });
}

export function useMyAssignmentsQuery() {
  return useQuery({
    queryKey: ["moi", "assignations"],
    queryFn: () => api.get<MyAssignments>("moi/assignations"),
  });
}
