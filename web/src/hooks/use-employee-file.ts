import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Candidate,
  EmergencyContact,
  EmployeeAddress,
  EmployeeCredential,
  EmployeeCvEntry,
  EmployeeWage,
  HireCandidateValues,
  HourBank,
  HrSectionCounts,
  LeaveRequest,
  LeaveStatus,
  SaveCandidateValues,
  SaveEmergencyContactValues,
  SaveEmployeeAddressValues,
  SaveEmployeeCredentialValues,
  SaveEmployeeCvEntryValues,
  SaveEmployeeWageValues,
  SaveHourBankEntryValues,
  SaveLeaveValues,
  SaveScheduleShiftValues,
  ScheduleWeek,
} from "@/lib/types";
import type { EmployeeFileCounts, EmployeeWeek } from "@/lib/types";

/**
 * Everything on an employee's file.
 *
 * One key prefix for the lot, because these lists are read together — the rail on the HR page
 * shows a count for each, and a save that invalidated only its own list would leave the badge
 * beside it saying yesterday's number.
 */
const RH = ["rh"];

function query(suffix: string, employeeId: string | undefined) {
  return employeeId ? `${suffix}?employe=${employeeId}` : suffix;
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: RH });
}

// ---- Adresses ----

export function useEmployeeAddressesQuery(employeeId?: string) {
  return useQuery({
    queryKey: [...RH, "adresses", employeeId ?? "toutes"],
    queryFn: () => api.get<EmployeeAddress[]>(query("rh/adresses", employeeId)),
  });
}

export function useSaveEmployeeAddress() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, values }: { id: string | null; values: SaveEmployeeAddressValues }) =>
      id
        ? api.put<EmployeeAddress>(`rh/adresses/${id}`, values)
        : api.post<EmployeeAddress>("rh/adresses", values),
    onSuccess: refresh,
  });
}

export function useDeleteEmployeeAddress() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`rh/adresses/${id}`),
    onSuccess: refresh,
  });
}

// ---- Contacts d'urgence ----

export function useEmergencyContactsQuery(employeeId?: string) {
  return useQuery({
    queryKey: [...RH, "contacts-urgence", employeeId ?? "tous"],
    queryFn: () => api.get<EmergencyContact[]>(query("rh/contacts-urgence", employeeId)),
  });
}

export function useSaveEmergencyContact() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, values }: { id: string | null; values: SaveEmergencyContactValues }) =>
      id
        ? api.put<EmergencyContact>(`rh/contacts-urgence/${id}`, values)
        : api.post<EmergencyContact>("rh/contacts-urgence", values),
    onSuccess: refresh,
  });
}

export function useDeleteEmergencyContact() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`rh/contacts-urgence/${id}`),
    onSuccess: refresh,
  });
}

// ---- Formations et permis ----

export function useCredentialsQuery(employeeId?: string) {
  return useQuery({
    queryKey: [...RH, "formations", employeeId ?? "toutes"],
    queryFn: () => api.get<EmployeeCredential[]>(query("rh/formations", employeeId)),
  });
}

export function useSaveCredential() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, values }: { id: string | null; values: SaveEmployeeCredentialValues }) =>
      id
        ? api.put<EmployeeCredential>(`rh/formations/${id}`, values)
        : api.post<EmployeeCredential>("rh/formations", values),
    onSuccess: refresh,
  });
}

export function useDeleteCredential() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`rh/formations/${id}`),
    onSuccess: refresh,
  });
}

// ---- CV ----

export function useCvQuery(employeeId: string) {
  return useQuery({
    queryKey: [...RH, "cv", employeeId],
    queryFn: () => api.get<EmployeeCvEntry[]>(`rh/employes/${employeeId}/cv`),
  });
}

export function useSaveCvEntry(employeeId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, values }: { id: string | null; values: SaveEmployeeCvEntryValues }) =>
      id
        ? api.put<EmployeeCvEntry>(`rh/cv/${id}`, values)
        : api.post<EmployeeCvEntry>(`rh/employes/${employeeId}/cv`, values),
    onSuccess: refresh,
  });
}

export function useDeleteCvEntry() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`rh/cv/${id}`),
    onSuccess: refresh,
  });
}

// ---- Salaires ----

export function useWagesQuery(employeeId: string) {
  return useQuery({
    queryKey: [...RH, "salaires", employeeId],
    queryFn: () => api.get<EmployeeWage[]>(`rh/employes/${employeeId}/salaires`),
  });
}

export function useAddWage(employeeId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (values: SaveEmployeeWageValues) =>
      api.post<EmployeeWage>(`rh/employes/${employeeId}/salaires`, values),
    onSuccess: refresh,
  });
}

export function useDeleteWage(employeeId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`rh/employes/${employeeId}/salaires/${id}`),
    onSuccess: refresh,
  });
}

// ---- Banque d'heures ----

export function useHourBankQuery(employeeId: string) {
  return useQuery({
    queryKey: [...RH, "banque-heures", employeeId],
    queryFn: () => api.get<HourBank>(`rh/employes/${employeeId}/banque-heures`),
  });
}

export function useAddHourBankEntry(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveHourBankEntryValues) =>
      api.post<HourBank>(`rh/employes/${employeeId}/banque-heures`, values),
    // The endpoint answers with the whole bank, so the balance is right before the refetch
    // lands — and the refetch still happens, because an approved leave moves it too.
    onSuccess: (bank) => {
      queryClient.setQueryData([...RH, "banque-heures", employeeId], bank);
      queryClient.invalidateQueries({ queryKey: RH });
    },
  });
}

export function useDeleteHourBankEntry(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<HourBank>(`rh/employes/${employeeId}/banque-heures/${id}`),
    onSuccess: (bank) => {
      queryClient.setQueryData([...RH, "banque-heures", employeeId], bank);
      queryClient.invalidateQueries({ queryKey: RH });
    },
  });
}

// ---- Congés ----

export function useLeavesQuery(options: { employeeId?: string; status?: LeaveStatus } = {}) {
  const params = new URLSearchParams();
  if (options.employeeId) params.set("employe", options.employeeId);
  if (options.status) params.set("statut", options.status);
  const suffix = params.toString();

  return useQuery({
    queryKey: [...RH, "conges", options.employeeId ?? "tous", options.status ?? "tous"],
    queryFn: () => api.get<LeaveRequest[]>(`conges${suffix ? `?${suffix}` : ""}`),
  });
}

export function useCreateLeave() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (values: SaveLeaveValues) => api.post<LeaveRequest>("conges", values),
    onSuccess: refresh,
  });
}

export function useDecideLeave() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, approve, decisionNote }: { id: string; approve: boolean; decisionNote: string | null }) =>
      api.post<LeaveRequest>(`conges/${id}/decision`, { approve, decisionNote }),
    onSuccess: refresh,
  });
}

export function useCancelLeave() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.post<LeaveRequest>(`conges/${id}/annuler`, {}),
    onSuccess: refresh,
  });
}

// ---- Horaire ----

export function useScheduleQuery(week: string | null, employeeId?: string) {
  const params = new URLSearchParams();
  if (week) params.set("semaine", week);
  if (employeeId) params.set("employe", employeeId);
  const suffix = params.toString();

  return useQuery({
    queryKey: [...RH, "horaire", week ?? "courante", employeeId ?? "tous"],
    queryFn: () => api.get<ScheduleWeek>(`horaire${suffix ? `?${suffix}` : ""}`),
  });
}

export function useSaveShift() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, values }: { id: string | null; values: SaveScheduleShiftValues }) =>
      id ? api.put(`horaire/${id}`, values) : api.post("horaire", values),
    onSuccess: refresh,
  });
}

export function useDeleteShift() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`horaire/${id}`),
    onSuccess: refresh,
  });
}

// ---- Candidats ----

export function useCandidatesQuery(search: string, status?: string) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("recherche", search.trim());
  if (status) params.set("statut", status);
  const suffix = params.toString();

  return useQuery({
    queryKey: [...RH, "candidats", search, status ?? "tous"],
    queryFn: () => api.get<Candidate[]>(`candidats${suffix ? `?${suffix}` : ""}`),
  });
}

export function useSaveCandidate() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, values }: { id: string | null; values: SaveCandidateValues }) =>
      id ? api.put<Candidate>(`candidats/${id}`, values) : api.post<Candidate>("candidats", values),
    onSuccess: refresh,
  });
}

export function useHireCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: HireCandidateValues }) =>
      api.post<Candidate>(`candidats/${id}/embaucher`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RH });
      // Hiring writes an employee row, so the staff list and its seat count are stale too.
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr"] });
    },
  });
}

export function useDeleteCandidate() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`candidats/${id}`),
    onSuccess: refresh,
  });
}

// ---- Les pastilles ----

export function useHrSectionCountsQuery() {
  return useQuery({
    queryKey: [...RH, "sections"],
    queryFn: () => api.get<HrSectionCounts>("rh/sections"),
  });
}

// ---- Feuilles de temps ----

/**
 * One person's hours, a week at a time.
 *
 * The same answer as the one they see on their own screen: the office and the employee reading
 * different totals for the same week is a conversation nobody can win.
 */
export function useEmployeeWeekQuery(employeeId: string, week: string | null) {
  return useQuery({
    queryKey: [...RH, "heures", employeeId, week ?? "courante"],
    queryFn: () =>
      api.get<EmployeeWeek>(`rh/employes/${employeeId}/heures${week ? `?semaine=${week}` : ""}`),
  });
}

/** The badges on one employee's rail, in one call rather than thirteen. */
export function useEmployeeFileCountsQuery(employeeId: string) {
  return useQuery({
    queryKey: [...RH, "sections", employeeId],
    queryFn: () => api.get<EmployeeFileCounts>(`rh/employes/${employeeId}/sections`),
  });
}
