import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
    mutationFn: (answers: { fieldId: string; value: string | null }[]) =>
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
