import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CompanyLocation, HrCounts, HrDocument, TeamRecord } from "@/lib/types";

const HR_KEY = ["hr"];

export interface SaveTeamValues {
  name: string;
  description: string | null;
  leadEmployeeId: string | null;
  memberIds: string[];
}

export interface SaveLocationValues {
  label: string;
  isPrimary: boolean;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  postalCode: string;
  country: string | null;
  phone: string | null;
}

export interface SaveDocumentValues {
  title: string;
  category: string | null;
  employeeId: string | null;
  mediaAssetId: string;
}

export function useHrCountsQuery() {
  return useQuery({
    queryKey: [...HR_KEY, "counts"],
    queryFn: () => api.get<HrCounts>("hr/counts"),
  });
}

export function useTeamsQuery() {
  return useQuery({
    queryKey: [...HR_KEY, "teams"],
    queryFn: () => api.get<TeamRecord[]>("hr/teams"),
  });
}

export function useSaveTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveTeamValues }) =>
      id ? api.put<TeamRecord>(`hr/teams/${id}`, values) : api.post<TeamRecord>("hr/teams", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HR_KEY }),
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`hr/teams/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HR_KEY }),
  });
}

export function useLocationsQuery() {
  return useQuery({
    queryKey: [...HR_KEY, "locations"],
    queryFn: () => api.get<CompanyLocation[]>("hr/locations"),
  });
}

export function useSaveLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveLocationValues }) =>
      id
        ? api.put<CompanyLocation>(`hr/locations/${id}`, values)
        : api.post<CompanyLocation>("hr/locations", values),
    // The company profile shows the primary location, so it has to be refreshed too.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HR_KEY });
      queryClient.invalidateQueries({ queryKey: ["company"] });
    },
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`hr/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HR_KEY });
      queryClient.invalidateQueries({ queryKey: ["company"] });
    },
  });
}

export function useDocumentsQuery() {
  return useQuery({
    queryKey: [...HR_KEY, "documents"],
    queryFn: () => api.get<HrDocument[]>("hr/documents"),
  });
}

export function useSaveDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveDocumentValues) => api.post<HrDocument>("hr/documents", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HR_KEY }),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`hr/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HR_KEY }),
  });
}
