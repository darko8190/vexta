import type { InvoiceStatus } from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ApplicationEligibility,
  MyApplication,
  MyInvoice,
  MyJob,
  MyOrder,
  PersonalProfile,
  SavePersonalProfileValues,
} from "@/lib/types";

/**
 * Somebody's own CV and the applications it has sent.
 *
 * Its own key, not under a tenant's: this record belongs to the person. Switching from a
 * personal space into a company must not invalidate it, and it reads the same from either.
 */
const KEY = ["mon-profil"];

export function usePersonalProfileQuery(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<PersonalProfile>("mon-profil"),
    enabled,
  });
}

export function useSavePersonalProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SavePersonalProfileValues) =>
      api.put<PersonalProfile>("mon-profil", values),
    onSuccess: (profile) => {
      // Written straight in rather than refetched: the response is the saved record, and the
      // completeness flag on it is what the apply button reads.
      queryClient.setQueryData(KEY, profile);
      void queryClient.invalidateQueries({ queryKey: ["candidatures"] });
    },
  });
}

export function useMyApplicationsQuery(enabled = true) {
  return useQuery({
    queryKey: [...KEY, "candidatures"],
    queryFn: () => api.get<MyApplication[]>("mon-profil/candidatures"),
    enabled,
  });
}

/**
 * Whether this account may apply to a posting, and what is missing if not.
 *
 * Asked before the button is offered so somebody is told what to fill in, rather than refused
 * after writing a covering note.
 */
export function useApplicationEligibilityQuery(slug: string, jobPostingId: string | null) {
  return useQuery({
    queryKey: ["candidatures", "admissibilite", slug, jobPostingId],
    queryFn: () =>
      api.get<ApplicationEligibility>(
        `candidatures/admissibilite?slug=${encodeURIComponent(slug)}&offre=${jobPostingId}`,
      ),
    enabled: Boolean(jobPostingId),
  });
}

export function useApplyToJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: {
      slug: string;
      jobPostingId: string;
      coverNote: string | null;
      answers: { fieldId: string; value: string | null; mediaAssetId: string | null }[];
    }) => api.post<{ message: string }>("candidatures", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["candidatures"] });
      void queryClient.invalidateQueries({ queryKey: [...KEY, "candidatures"] });
    },
  });
}

/**
 * The companies this person works for.
 *
 * Read from the employee records that carry their account, not from what they may open: a
 * login to a company is not a job at it.
 */
export function useMyJobsQuery(enabled = true) {
  return useQuery({
    queryKey: ["mon-espace", "emplois"],
    queryFn: () => api.get<MyJob[]>("mon-espace/emplois"),
    enabled,
  });
}

/**
 * Every order this person placed, across every company they have bought from.
 *
 * Keyed on the account that placed it rather than on a customer file, unlike the invoices
 * below: an order was placed by somebody who was signed in at the time, and that person is the
 * one who should see it.
 */
export function useMyOrdersQuery(enabled = true) {
  return useQuery({
    queryKey: ["mon-espace", "commandes"],
    queryFn: () => api.get<MyOrder[]>("mon-espace/commandes"),
    enabled,
  });
}

/**
 * Every invoice this person has been sent, across every company that has one for them.
 *
 * Drafts are not among them: the API leaves them out, because an invoice that has not been
 * given to anybody is a document its sender has not finished writing.
 */
export function useMyInvoicesQuery(enabled = true) {
  return useQuery({
    queryKey: ["mon-espace", "factures"],
    queryFn: () => api.get<MyInvoice[]>("mon-espace/factures"),
    enabled,
  });
}

export interface MyInvoiceDetail {
  id: string;
  number: string;
  companyName: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  status: InvoiceStatus;
  notes: string | null;
  lines: { description: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number;
  gst: number;
  qst: number;
  total: number;
  paid: number;
  outstanding: number;
  /** Set when the invoice can be paid online: the company's Stripe account takes cards. */
  payToken: string | null;
}

/** One of the person's invoices in full, to read from their space. */
export function useMyInvoiceQuery(id: string) {
  return useQuery({
    queryKey: ["mon-espace", "factures", id],
    queryFn: () => api.get<MyInvoiceDetail>(`mon-espace/factures/${id}`),
  });
}

export type EmailStatus = { email: string; confirmed: boolean };

/** Whether the person has proved their address, which decides which invoices can find them. */
export function useEmailStatusQuery() {
  return useQuery({
    queryKey: ["auth", "courriel"],
    queryFn: () => api.get<EmailStatus>("auth/courriel"),
  });
}

export function useSendEmailConfirmation() {
  return useMutation({
    mutationFn: () => api.post<{ message: string }>("auth/courriel/verification"),
  });
}
