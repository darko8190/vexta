import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type {
  AdminReport,
  ReportKeyOption,
  ReportResult,
  ReportSummary,
  SaveReportValues,
} from "@/lib/types";

// ---- What a company is offered ----

export function useReportsQuery() {
  return useQuery({
    queryKey: ["rapports"],
    queryFn: () => api.get<ReportSummary[]>("rapports"),
  });
}

/**
 * Runs one report. Asked for by the row's id, never by its key: the API checks that this
 * company was offered it, and an id is what makes that check possible.
 */
export function useReportResultQuery(
  id: string | undefined,
  period: { from?: string; to?: string } = {},
) {
  return useQuery({
    queryKey: ["rapports", id, period.from ?? "", period.to ?? ""],
    queryFn: () =>
      api.get<ReportResult>(
        `rapports/${id}${buildQuery({ du: period.from, au: period.to })}`,
      ),
    enabled: Boolean(id),
  });
}

// ---- The catalogue, as the super admin manages it ----

const ADMIN_KEY = ["admin", "rapports"];

export function useAdminReportsQuery() {
  return useQuery({
    queryKey: ADMIN_KEY,
    queryFn: () => api.get<AdminReport[]>("admin/rapports"),
  });
}

/** The calculations that exist, so the form offers exactly those. */
export function useReportKeysQuery() {
  return useQuery({
    queryKey: [...ADMIN_KEY, "cles"],
    queryFn: () => api.get<ReportKeyOption[]>("admin/rapports/cles"),
    // Fixed by the deployment, not by anything anybody types.
    staleTime: Infinity,
  });
}

export function useSaveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveReportValues }) =>
      id
        ? api.put<AdminReport>(`admin/rapports/${id}`, values)
        : api.post<AdminReport>("admin/rapports", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
      // A company's own list changes with the catalogue, so it cannot be left as it was.
      queryClient.invalidateQueries({ queryKey: ["rapports"] });
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`admin/rapports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
      queryClient.invalidateQueries({ queryKey: ["rapports"] });
    },
  });
}
