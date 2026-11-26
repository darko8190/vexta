import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "@/lib/api";
import type {
  InvoiceLine,
  InvoiceRecord,
  InvoiceSendDefaults,
  InvoiceStatus,
  PagedResult,
  SendInvoiceValues,
} from "@/lib/types";

export interface InvoiceFormValues {
  clientId: string;
  projectId?: string | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  notes?: string;
  /** Omitted on a new invoice means "take the project's answer, or the client's". */
  isTaxExempt?: boolean | null;
  /** Which margin catalogue lines are priced with. Omitted takes the project's, then the default. */
  pricePolicyId?: string | null;
  lines: InvoiceLine[];
}

/**
 * What a project would be invoiced as, before anything is saved: the client, the policy, the
 * exemption and one line per thing the job consumed.
 *
 * Shaped like the lines the form already carries, so filling it in is an assignment rather than
 * a translation. Nothing here exists in the database yet.
 */
export interface InvoiceDraft {
  clientId: string;
  /** The project's price policy, or the company's default when it names none. */
  pricePolicyId: string | null;
  isTaxExempt: boolean;
  lines: InvoiceLine[];
}

/**
 * The draft for one project. Read once when the form opens and then left alone: it is a snapshot
 * of the job at that moment, and re-fetching it would reach into a form someone is typing in.
 */
export function useInvoiceDraftQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: ["invoice-draft", projectId],
    queryFn: () => api.get<InvoiceDraft>(`invoices/draft${buildQuery({ projectId })}`),
    enabled: Boolean(projectId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useInvoicesQuery(
  page: number,
  search: string,
  clientId?: string,
  status?: InvoiceStatus,
  projectId?: string,
  /** The sort, already as query parameters (see sortToQuery). */
  sort: Record<string, string> = {},
) {
  return useQuery({
    queryKey: ["invoices", page, search, clientId, status, projectId, sort],
    queryFn: () =>
      api.get<PagedResult<InvoiceRecord>>(
        `invoices${buildQuery({ page, search, clientId, status, projectId, ...sort })}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useInvoiceQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["invoices", id],
    queryFn: () => api.get<InvoiceRecord>(`invoices/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: InvoiceFormValues) => api.post<InvoiceRecord>("invoices", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: InvoiceFormValues }) =>
      api.put<InvoiceRecord>(`invoices/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/**
 * What the send form opens with: the addresses on file, the employees who can be put in copy,
 * the company's own wording already filled in with this invoice's figures, and the documents of
 * its project.
 *
 * Read when the dialog opens and then left alone — the subject and the message are being typed
 * into, and a background refetch would reach into them. A contact created inside the form
 * invalidates this key on purpose, which is the one case where the list has to come back.
 */
/**
 * Invoices by default; "soumissions" for a quote, whose send endpoints answer in the same shapes
 * so the one dialog sends both.
 */
export type SendBase = "invoices" | "soumissions";

export function useInvoiceSendDefaultsQuery(
  id: string,
  enabled: boolean,
  base: SendBase = "invoices",
  /** A quote's reminder: the same form, with the reminder's wording. */
  reminder = false,
) {
  return useQuery({
    queryKey: ["invoice-send-defaults", base, id, reminder],
    queryFn: () =>
      api.get<InvoiceSendDefaults>(`${base}/${id}/send-defaults${reminder ? "?relance=true" : ""}`),
    enabled: enabled && Boolean(id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * Emails the invoice with the PDF attached and marks it sent — but only if the message was
 * accepted, which is the API's rule and not this hook's to soften.
 */
export function useSendInvoice(base: SendBase = "invoices") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: SendInvoiceValues }) =>
      api.post<{ email: string; sentAt: string; status: InvoiceStatus }>(`${base}/${id}/send`, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["envois"] });
      return queryClient.invalidateQueries({ queryKey: base === "invoices" ? ["invoices"] : ["quotes"] });
    },
  });
}
