import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type {
  PagedResult,
  QuoteFormValues,
  QuoteLine,
  QuoteLineKind,
  QuoteRecord,
  QuoteStatus,
  QuoteSummary,
  SaveQuoteLineValues,
} from "@/lib/types";

/**
 * One invalidate of the whole "quotes" key on every write: the list carries the subtotal, the
 * record carries the status, the summary carries the money, and a line moves all three.
 */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["quotes"] });
}

export function useQuotesQuery(page: number, search: string, status?: QuoteStatus, clientId?: string) {
  return useQuery({
    queryKey: ["quotes", "list", page, search, status, clientId],
    queryFn: () =>
      api.get<PagedResult<QuoteRecord>>(`soumissions${buildQuery({ page, search, status, clientId })}`),
    placeholderData: (previous) => previous,
  });
}

export function useQuoteQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["quotes", "one", id],
    queryFn: () => api.get<QuoteRecord>(`soumissions/${id}`),
    enabled: Boolean(id),
  });
}

export function useQuoteSummaryQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["quotes", "summary", id],
    queryFn: () => api.get<QuoteSummary>(`soumissions/${id}/sommaire`),
    enabled: Boolean(id),
  });
}

export function useQuoteLinesQuery(id: string | undefined, kind: QuoteLineKind) {
  return useQuery({
    queryKey: ["quotes", "lines", id, kind],
    queryFn: () => api.get<QuoteLine[]>(`soumissions/${id}/lignes${buildQuery({ kind })}`),
    enabled: Boolean(id),
  });
}

export function useCreateQuote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (values: QuoteFormValues) => api.post<QuoteRecord>("soumissions", values),
    onSuccess: invalidate,
  });
}

export function useUpdateQuote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: QuoteFormValues }) =>
      api.put<QuoteRecord>(`soumissions/${id}`, values),
    onSuccess: invalidate,
  });
}

export function useDeleteQuote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`soumissions/${id}`),
    onSuccess: invalidate,
  });
}

/** Turns the quote into a project. The projects list moves too, so both keys are refreshed. */
export function useConvertQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<QuoteRecord>(`soumissions/${id}/convertir`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/** A new draft with the same client, words and lines. Answers with the new quote. */
export function useDuplicateQuote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<QuoteRecord>(`soumissions/${id}/dupliquer`),
    onSuccess: () => invalidate(),
  });
}

/**
 * A « Demande de soumission » reply made into a draft quote. The form's replies are refreshed
 * too, since the reply now points at its quote.
 */
export function useQuoteFromSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submissionId: string) => api.post<QuoteRecord>(`soumissions/depuis-reponse/${submissionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["formulaires"] });
    },
  });
}

/**
 * The customer's answer from their portal. Accepting makes the project on the server, so the
 * project lists are refreshed along with the quote.
 */
export function useRespondToQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answer, note }: { id: string; answer: "accepter" | "refuser"; note: string | null }) =>
      api.post<QuoteRecord>(`soumissions/${id}/${answer}`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useSaveQuoteLine(quoteId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: SaveQuoteLineValues }) =>
      id
        ? api.put<QuoteLine>(`soumissions/${quoteId}/lignes/${id}`, values)
        : api.post<QuoteLine>(`soumissions/${quoteId}/lignes`, values),
    onSuccess: invalidate,
  });
}

export function useDeleteQuoteLine(quoteId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`soumissions/${quoteId}/lignes/${id}`),
    onSuccess: invalidate,
  });
}

/** The quote exactly as stored, in the save endpoint's shape — the base an inline edit patches. */
export function storedQuoteValues(quote: QuoteRecord): QuoteFormValues {
  return {
    clientId: quote.clientId,
    poNumber: quote.poNumber,
    description: quote.description,
    status: quote.status,
    issuedOn: quote.issuedOn,
    validUntil: quote.validUntil,
    startDate: quote.startDate,
    endDate: quote.endDate,
    isTaxExempt: quote.isTaxExempt,
    clientAddressId: quote.clientAddress?.id ?? null,
    sameAddressAsClient: quote.sameAddressAsClient,
    siteAddressId: quote.siteAddress?.id ?? null,
    clientAssetId: quote.clientAssetId,
    categoryId: quote.categoryId,
    subCategoryId: quote.subCategoryId,
    wageClassificationId: quote.wageClassificationId,
  };
}
