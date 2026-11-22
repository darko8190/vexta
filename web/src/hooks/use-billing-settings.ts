import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface BillingSettings {
  /** False until the company has saved these once. The API refuses to invoice before then. */
  configured: boolean;
  gstNumber: string | null;
  qstNumber: string | null;
  gstRate: number;
  qstRate: number;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  paymentTermsDays: number;
  terms: string | null;
  footerNote: string | null;
  /** What the next invoice will be called, so the preview can show it before it exists. */
  nextInvoiceLabel: string;
}

export type SaveBillingSettingsValues = Omit<BillingSettings, "configured" | "nextInvoiceLabel">;

export function useBillingSettingsQuery() {
  return useQuery({
    queryKey: ["billing-settings"],
    queryFn: () => api.get<BillingSettings>("billing-settings"),
  });
}

export function useSaveBillingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SaveBillingSettingsValues) => api.put<BillingSettings>("billing-settings", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing-settings"] }),
  });
}
