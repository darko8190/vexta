import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MarginMode } from "@/lib/types";

export interface BillingSettings {
  /** False until the company has saved these once. The API refuses to invoice before then. */
  configured: boolean;
  gstNumber: string | null;
  qstNumber: string | null;
  /** The RBQ licence, printed under the company's address on every invoice. */
  rbqNumber: string | null;
  gstRate: number;
  qstRate: number;
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
}

export type SaveBillingSettingsValues = Omit<BillingSettings, "configured" | "nextInvoiceLabel">;

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

export function useBillingSettingsQuery() {
  return useQuery({
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
