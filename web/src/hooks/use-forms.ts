import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type {
  FormResponsesSummary,
  FormSubmission,
  FormSubmissionDetail,
  FormTemplate,
  FormTemplateDetail,
  SaveFormActionValues,
  SaveFormFieldValues,
  SaveFormTemplateValues,
  SubmitFormResult,
} from "@/lib/types";

/**
 * One invalidate of the whole "formulaires" key.
 *
 * The list carries the counts of questions, actions and replies, so every write has to move the
 * list and the form together — a badge that disagrees with the page under it is the kind of
 * small wrongness that makes people stop trusting the counts.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["formulaires"] });
}

export function useFormsQuery() {
  return useQuery({
    queryKey: ["formulaires"],
    queryFn: () => api.get<FormTemplate[]>("formulaires"),
  });
}

/** Undefined is "nothing to fetch", which is what a page passes before its id has arrived. */
export function useFormQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["formulaires", "detail", id],
    queryFn: () => api.get<FormTemplateDetail>(`formulaires/${id}`),
    enabled: Boolean(id),
  });
}

/** Where strangers fill the form, or why there is no such place yet. */
export interface FormPublicLink {
  /** A path on this site: the form's own page (/f/{id}). */
  path: string | null;
  /** The step that would make a link, worded for the person. */
  missing: string | null;
}

/** Under the "formulaires" key, so saving the fiche (publishing, ticking the page) refreshes it. */
export function useFormPublicLinkQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["formulaires", "lien", id],
    queryFn: () => api.get<FormPublicLink>(`formulaires/${id}/lien`),
    enabled: Boolean(id),
  });
}

export interface SendFormLinkResult {
  /** The client the answers go to without a sign-in, when the address is one of theirs. */
  clientName: string | null;
  /** The form files on a client's record (and so would otherwise ask for a sign-in). */
  filesOnClient: boolean;
}

/** E-mails the form's link to one person, from the company's name. */
export function useSendFormLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, email, message }: { id: string; email: string; message: string | null }) =>
      api.post<SendFormLinkResult>(`formulaires/${id}/envoyer`, { email, message }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["formulaires", "envois"] }),
  });
}

/** One form e-mailed to one address, and whether it came back. */
export interface FormShare {
  id: string;
  formId: string;
  formTitle: string;
  email: string;
  clientId: string | null;
  clientName: string | null;
  sentByName: string | null;
  sentAt: string;
  lastSentAt: string;
  sendCount: number;
  /** When a reply came back through this link. Null while it is still waited for. */
  answeredAt: string | null;
}

/** The forms sent, for one form or one client. Under "formulaires", so a reply refreshes it. */
export function useFormSharesQuery(filter: { formId?: string; clientId?: string }) {
  return useQuery({
    queryKey: ["formulaires", "envois", filter.formId ?? null, filter.clientId ?? null],
    queryFn: () => api.get<FormShare[]>(`formulaires/envois${buildQuery(filter)}`),
  });
}

/** The same message again, to somebody who has not answered yet. */
export function useResendFormShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => api.post<FormShare>(`formulaires/envois/${shareId}/renvoyer`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["formulaires", "envois"] }),
  });
}

export function useCreateForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveFormTemplateValues) =>
      api.post<FormTemplateDetail>("formulaires", values),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: SaveFormTemplateValues }) =>
      api.put<FormTemplateDetail>(`formulaires/${id}`, values),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`formulaires/${id}`),
    onSuccess: () => invalidate(queryClient),
  });
}

/**
 * The questions, in the order they are to be asked.
 *
 * The whole list every time: what is sent replaces what the form had, which is what makes
 * reordering, renaming and deleting one save rather than three endpoints.
 */
export function useSaveFormFields(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fields: SaveFormFieldValues[]) =>
      api.put<FormTemplateDetail>(`formulaires/${id}/questions`, { fields }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useSaveFormActions(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actions: SaveFormActionValues[]) =>
      api.put<FormTemplateDetail>(`formulaires/${id}/actions`, { actions }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useFormSubmissionsQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["formulaires", "reponses", id],
    queryFn: () => api.get<FormSubmission[]>(`formulaires/${id}/reponses`),
    enabled: Boolean(id),
  });
}

export function useFormSubmissionQuery(formId: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: ["formulaires", "reponses", formId, id],
    queryFn: () => api.get<FormSubmissionDetail>(`formulaires/${formId}/reponses/${id}`),
    enabled: Boolean(formId && id),
  });
}

export function useSubmitForm(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      answers: { fieldId: string; value: string | null; mediaAssetId?: string | null }[],
    ) =>
      api.post<SubmitFormResult>(`formulaires/${id}/reponses`, { answers }),
    onSuccess: () => {
      invalidate(queryClient);
      // A form that creates clients has just created one, and the client list is somewhere else.
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useDeleteFormSubmission(formId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`formulaires/${formId}/reponses/${id}`),
    onSuccess: () => invalidate(queryClient),
  });
}

/**
 * The forms that have been filled, newest activity first.
 *
 * Its own query rather than a field on the forms list: this is read on a screen the builder
 * never opens, and the builder's list is read on every page that offers a form.
 */
export function useFormResponsesQuery() {
  return useQuery({
    queryKey: ["formulaires", "reponses"],
    queryFn: () => api.get<FormResponsesSummary[]>("formulaires/reponses"),
  });
}
