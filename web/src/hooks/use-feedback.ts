"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type FeedbackKind = "bug" | "suggestion";
export type FeedbackStatus = "Sent" | "InProgress" | "Resolved";

export interface FeedbackRequest {
  id: string;
  kind: FeedbackKind;
  message: string;
  pageUrl: string | null;
  hasScreenshot: boolean;
  status: FeedbackStatus;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface AdminFeedbackRequest extends FeedbackRequest {
  senderName: string;
  senderEmail: string;
  tenantName: string | null;
}

export const feedbackStatuses: FeedbackStatus[] = ["Sent", "InProgress", "Resolved"];

/** « Corrigée » for a bug, « Répondue » for a suggestion: the same state, said the way it reads. */
export function feedbackStatusLabel(status: FeedbackStatus, kind?: FeedbackKind): string {
  if (status === "Sent") return "Envoyée";
  if (status === "InProgress") return "En traitement";
  if (kind === "bug") return "Corrigée";
  if (kind === "suggestion") return "Répondue";
  return "Corrigée / Répondue";
}

export function feedbackKindLabel(kind: FeedbackKind): string {
  return kind === "bug" ? "Bogue" : "Amélioration";
}

export function useMyFeedbackQuery() {
  return useQuery({ queryKey: ["feedback", "mine"], queryFn: () => api.get<FeedbackRequest[]>("feedback") });
}

export function useDeleteFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`feedback/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feedback", "mine"] }),
  });
}

export function useAdminFeedbackQuery(enabled = true) {
  return useQuery({
    queryKey: ["feedback", "admin"],
    queryFn: () => api.get<AdminFeedbackRequest[]>("admin/signalements"),
    enabled,
  });
}

export function useSetFeedbackStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      api.patch(`admin/signalements/${id}/etat`, { status }),
    // The button lights up at once; the list is read again afterwards either way.
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["feedback", "admin"] });
      queryClient.setQueryData<AdminFeedbackRequest[]>(["feedback", "admin"], (rows) =>
        rows?.map((row) => (row.id === id ? { ...row, status } : row)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["feedback", "admin"] }),
  });
}

export function useRespondFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, response }: { id: string; status: FeedbackStatus; response: string }) =>
      api.put(`admin/signalements/${id}/reponse`, { status, response }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feedback", "admin"] }),
  });
}
