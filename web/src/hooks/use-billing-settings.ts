import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { InvoiceEmailField, MarginMode } from "@/lib/types";

export interface BillingSettings {
  /** False until the company has saved these once. The API refuses to invoice before then. */
  configured: boolean;
  gstNumber: string | null;
  qstNumber: string | null;
  /** The RBQ licence, printed under the company's address on every invoice. */
  rbqNumber: string | null;
  gstRate: number;
  qstRate: number;
  /** What the company bills in. Asked once here rather than on every invoice. */
  currency: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  paymentTermsDays: number;
  terms: string | null;
  footerNote: string | null;
  /** The starting price of a Main-d'œuvre line. Null until the company says what an hour costs. */
  defaultHourlyRate: number | null;
  /** Which of the two conventions this company means by "la marge". */
  marginMode: MarginMode;
  /** The policy a project or an invoice uses when it names none. */
  defaultPricePolicyId: string | null;
  /** What the next invoice will be called, so the preview can show it before it exists. */
  nextInvoiceLabel: string;
  /**
   * What the company wrote for the invoice email, or null when it wrote nothing — which means
   * "send the built-in wording". Never filled in with a copy of the default: a company that
   * has not written its own follows the default as it improves.
   */
  invoiceEmailSubject: string | null;
  invoiceEmailBody: string | null;
  /** The built-in wording, and what « Reprendre le modèle par défaut » writes into the fields. */
  defaultInvoiceEmailSubject: string;
  defaultInvoiceEmailBody: string;
  /** The fields a template may use, as the renderer itself lists them. */
  invoiceEmailFields: InvoiceEmailField[];
  /** The same for the message a quote leaves with. */
  quoteEmailSubject: string | null;
  quoteEmailBody: string | null;
  defaultQuoteEmailSubject: string;
  defaultQuoteEmailBody: string;
  quoteEmailFields: InvoiceEmailField[];
  /** The conditions printed on quotes above the signature. */
  quoteTerms: string | null;
  /** Days before an unanswered quote is reminded automatically. Null for never. */
  quoteReminderDays: number | null;
  /** Days past due before an unpaid invoice is reminded automatically. Null for never. */
  invoiceReminderDays: number | null;
  /** How many reminders each gets per sending, spaced by its delay. */
  quoteReminderCount: number;
  invoiceReminderCount: number;
  /** What the client may answer straight from the quote's email. */
  quoteEmailCanApprove?: boolean;
  quoteEmailCanRequestChange?: boolean;
  quoteEmailCanRefuse?: boolean;
}

/** Which document's email a template card edits. */
export type EmailTemplateKind = "facture" | "soumission";

/** Where each kind is saved and previewed. */
const emailEndpoint: Record<EmailTemplateKind, string> = {
  facture: "billing-settings/email",
  soumission: "billing-settings/email/soumission",
};

/**
 * The email template is deliberately absent: the full PUT does not carry it, and a card that
 * sends the whole row back must not be able to blank out a message it never showed.
 */
export type SaveBillingSettingsValues = Omit<
  BillingSettings,
  | "configured"
  | "nextInvoiceLabel"
  | "invoiceEmailSubject"
  | "invoiceEmailBody"
  | "defaultInvoiceEmailSubject"
  | "defaultInvoiceEmailBody"
  | "invoiceEmailFields"
  | "quoteEmailSubject"
  | "quoteEmailBody"
  | "defaultQuoteEmailSubject"
  | "defaultQuoteEmailBody"
  | "quoteEmailFields"
  | "quoteTerms"
  | "quoteReminderDays"
  | "invoiceReminderDays"
  | "quoteReminderCount"
  | "invoiceReminderCount"
  | "quoteEmailCanApprove"
  | "quoteEmailCanRequestChange"
  | "quoteEmailCanRefuse"
>;

/**
 * The settings as the PUT wants them: it replaces the whole row, so a card that changes one
 * field sends the rest back unchanged. Without this, saving the hourly rate would quietly
 * reset the tax rates to the Québec defaults.
 *
 * It accepts nothing at all and answers with those same defaults, which is what a company that
 * has never saved these settings is looking at.
 */
export function toSaveValues(settings?: BillingSettings): SaveBillingSettingsValues {
  return {
    gstNumber: settings?.gstNumber ?? null,
    qstNumber: settings?.qstNumber ?? null,
    rbqNumber: settings?.rbqNumber ?? null,
    gstRate: settings?.gstRate ?? 5,
    qstRate: settings?.qstRate ?? 9.975,
    currency: settings?.currency ?? "CAD",
    invoicePrefix: settings?.invoicePrefix ?? "F",
    nextInvoiceNumber: settings?.nextInvoiceNumber ?? 1,
    paymentTermsDays: settings?.paymentTermsDays ?? 30,
    terms: settings?.terms ?? null,
    footerNote: settings?.footerNote ?? null,
    defaultHourlyRate: settings?.defaultHourlyRate ?? null,
    marginMode: settings?.marginMode ?? "Multiplication",
    defaultPricePolicyId: settings?.defaultPricePolicyId ?? null,
  };
}

export function useBillingSettingsQuery(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["billing-settings"],
    queryFn: () => api.get<BillingSettings>("billing-settings"),
  });
}

export interface SavePricingValues {
  defaultHourlyRate: number | null;
  marginMode: MarginMode;
  defaultPricePolicyId: string | null;
}

/**
 * The hourly rate, the margin mode and the default policy — and nothing else.
 *
 * Its own endpoint rather than the full save, because saving the billing card is what tells
 * the application the company has settled its taxes and its numbering. Setting an hourly rate
 * is not that decision, and borrowing the same PUT would unlock invoicing with Québec rates
 * nobody had looked at.
 */
export function useSavePricing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SavePricingValues) =>
      api.put<BillingSettings>("billing-settings/pricing", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-settings"] });
      queryClient.invalidateQueries({ queryKey: ["price-policies"] });
    },
  });
}

export interface SaveInvoiceEmailValues {
  /** Empty means "use the built-in wording": the API stores blank as null. */
  subject: string;
  body: string;
}

/**
 * The subject and the message an invoice leaves with — and nothing else.
 *
 * Its own endpoint for the same reason the pricing one has one: saving the billing card is how
 * a company declares its taxes and its numbering, and writing an email template is not that
 * decision. Borrowing the full PUT here would unlock invoicing with rates nobody looked at.
 */
export function useSaveEmailTemplate(kind: EmailTemplateKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveInvoiceEmailValues) => api.put<BillingSettings>(emailEndpoint[kind], values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing-settings"] }),
  });
}

export interface InvoiceEmailPreview {
  subject: string;
  /** HTML, already escaped field by field by the API that rendered it. */
  body: string;
}

/**
 * The template as it will arrive, rendered by the same code that sends it.
 *
 * It posts what is being typed rather than reading the saved row, so nobody has to commit a
 * template to find out what it looks like. Feed it a debounced value — the query key is the
 * template itself, so every keystroke would otherwise be a request.
 */
export function useEmailPreviewQuery(kind: EmailTemplateKind, subject: string, body: string, enabled = true) {
  return useQuery({
    queryKey: ["email-preview", kind, subject, body],
    queryFn: () => api.post<InvoiceEmailPreview>(`${emailEndpoint[kind]}/preview`, { subject, body }),
    enabled,
    // The previous rendering stays on screen while the next one is fetched, so the preview
    // never blinks empty between two keystrokes.
    placeholderData: (previous) => previous,
  });
}

export function useSaveBillingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveBillingSettingsValues) => api.put<BillingSettings>("billing-settings", values),
    // The default policy is stored here and shown in the policies table, so both move together.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-settings"] });
      queryClient.invalidateQueries({ queryKey: ["price-policies"] });
    },
  });
}

/** When an unanswered quote is reminded by itself, and how many times. Null days turns it off. */
export function useSaveQuoteReminder() {
  return useSaveReminder("billing-settings/soumission-relance");
}

export function useSaveInvoiceReminder() {
  return useSaveReminder("billing-settings/facture-relance");
}

function useSaveReminder(endpoint: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ days, count }: { days: number | null; count?: number }) =>
      api.put<BillingSettings>(endpoint, { days, count }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing-settings"] }),
  });
}

/** The conditions printed on every quote. Blank clears them. Its own endpoint, like the email. */
export function useSaveQuoteResponses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { canApprove: boolean; canRequestChange: boolean; canRefuse: boolean }) =>
      api.put<BillingSettings>("billing-settings/soumission-reponses", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing-settings"] }),
  });
}

export function useSaveQuoteTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (terms: string) => api.put<BillingSettings>("billing-settings/soumission-conditions", { terms }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing-settings"] }),
  });
}
