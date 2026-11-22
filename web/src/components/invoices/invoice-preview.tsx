"use client";

import { useCompanyProfileQuery } from "@/hooks/use-company";
import type { BillingSettings } from "@/hooks/use-billing-settings";

export interface PreviewLine {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRatePercent: number;
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(amount);
}

function date(iso: string) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The invoice as the client will receive it, beside the form that is building it.
 *
 * Rendered from what is on screen rather than from a saved record, so it answers while the
 * invoice is still a draft — which is the only time the answer is useful. It is deliberately
 * plain: the point is to catch a wrong address or a missing tax number before the thing is
 * sent, not to be a second place where the layout has to be maintained.
 */
export function InvoicePreview({
  number,
  clientName,
  clientAddress,
  projectLabel,
  poNumber,
  issueDate,
  dueDate,
  currency,
  notes,
  lines,
  settings,
}: {
  number: string;
  clientName: string;
  clientAddress?: string[];
  projectLabel?: string | null;
  poNumber?: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  notes?: string | null;
  lines: PreviewLine[];
  settings?: BillingSettings;
}) {
  const { data: company } = useCompanyProfileQuery();

  const billable = lines.filter((line) => line.description.trim() || line.unitPrice);
  const subtotal = billable.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0);
  const taxTotal = billable.reduce(
    (sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0) * ((l.taxRatePercent || 0) / 100),
    0,
  );

  return (
    <div className="rounded-lg border border-border bg-card p-5 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{company?.name ?? "Votre entreprise"}</p>
          {company?.address && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[company.address.line1, company.address.city, company.address.province, company.address.postalCode]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          {(settings?.gstNumber || settings?.qstNumber) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[settings.gstNumber && `TPS ${settings.gstNumber}`, settings.qstNumber && `TVQ ${settings.qstNumber}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Facture</p>
          <p className="font-mono font-semibold text-foreground">{number}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Facturé à</p>
          <p className="mt-1 truncate font-medium text-foreground">{clientName || "—"}</p>
          {clientAddress?.filter(Boolean).map((part) => (
            <p key={part} className="truncate text-xs text-muted-foreground">
              {part}
            </p>
          ))}
        </div>
        <div className="space-y-1 text-xs sm:text-right">
          <p>
            <span className="text-muted-foreground">Émise le </span>
            <span className="text-foreground">{date(issueDate)}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Échéance </span>
            <span className="text-foreground">{date(dueDate)}</span>
          </p>
          {projectLabel && (
            <p>
              <span className="text-muted-foreground">Projet </span>
              <span className="text-foreground">{projectLabel}</span>
            </p>
          )}
          {poNumber && (
            <p>
              <span className="text-muted-foreground">PO </span>
              <span className="text-foreground">{poNumber}</span>
            </p>
          )}
        </div>
      </div>

      <table className="mt-5 w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-1.5 text-left font-normal">Description</th>
            <th className="py-1.5 text-right font-normal">Qté</th>
            <th className="py-1.5 text-right font-normal">Prix</th>
            <th className="py-1.5 text-right font-normal">Montant</th>
          </tr>
        </thead>
        <tbody>
          {billable.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-center text-muted-foreground">
                Les lignes apparaîtront ici.
              </td>
            </tr>
          ) : (
            billable.map((line, index) => (
              <tr key={index} className="border-b border-border/60">
                <td className="py-1.5 pr-2 text-foreground">{line.description || "—"}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{line.quantity}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {money(line.unitPrice || 0, currency)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-foreground">
                  {money((line.quantity || 0) * (line.unitPrice || 0), currency)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-full max-w-[14rem] space-y-1 text-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>Sous-total</span>
          <span className="tabular-nums">{money(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Taxes</span>
          <span className="tabular-nums">{money(taxTotal, currency)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{money(subtotal + taxTotal, currency)}</span>
        </div>
      </div>

      {(notes || settings?.terms || settings?.footerNote) && (
        <div className="mt-5 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          {notes && <p className="whitespace-pre-line">{notes}</p>}
          {settings?.terms && <p className="whitespace-pre-line">{settings.terms}</p>}
          {settings?.footerNote && <p className="whitespace-pre-line">{settings.footerNote}</p>}
        </div>
      )}
    </div>
  );
}
