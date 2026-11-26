import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";

/**
 * A feuille de temps de jour: one employee's day, from start to end. Not the poinçons — those
 * are the hours on projects, billed to clients.
 */
export interface WorkDay {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  note: string | null;
  /** Start to end (or now), less the breaks. */
  hours: number;
  /** Hours pointed on projects that day, to compare with the day. */
  projectHours: number;
}

export interface MyDay {
  hasEmployee: boolean;
  today: WorkDay | null;
}

const key = ["journees"] as const;

export function useMyDayQuery() {
  return useQuery({
    queryKey: [...key, "moi", "aujourdhui"],
    queryFn: () => api.get<MyDay>("journees/moi/aujourdhui"),
    // The hours of a day under way move; a minute is fine enough for a clock nobody bills from.
    refetchInterval: 60_000,
  });
}

export function useStartDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<MyDay>("journees/moi/commencer"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useEndDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { breakMinutes: number | null; note: string | null }) =>
      api.post<MyDay>("journees/moi/terminer", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useMyWorkDaysQuery(from: string, to: string) {
  return useQuery({
    queryKey: [...key, "moi", from, to],
    queryFn: () => api.get<WorkDay[]>(`journees/moi${buildQuery({ du: from, au: to })}`),
    enabled: Boolean(from && to),
  });
}

export function useWorkDaysQuery(from: string, to: string, employeeId?: string) {
  return useQuery({
    queryKey: [...key, "tous", from, to, employeeId],
    queryFn: () => api.get<WorkDay[]>(`journees${buildQuery({ du: from, au: to, employe: employeeId })}`),
    placeholderData: (previous) => previous,
  });
}
