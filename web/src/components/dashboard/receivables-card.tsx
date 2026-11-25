"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardReceivables } from "@/lib/types";
import { cn } from "@/lib/utils";

function money(value: number, cents = false): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
}

/**
 * The money still owed, by age. One bar so the proportion reads at a glance, the four amounts
 * under it, then the invoices furthest behind — the calls to make today.
 *
 * Colour climbs with age only: not yet due is neutral, and the older a debt the deeper the red,
 * so the eye lands where the risk is.
 */
export function ReceivablesCard({ data }: { data: DashboardReceivables }) {
  const buckets = [
    { key: "notDue", label: "Pas encore dû", value: data.notDue, swatch: "bg-muted-foreground/30" },
    { key: "late1To30", label: "1 à 30 j de retard", value: data.late1To30, swatch: "bg-destructive/35" },
    { key: "late31To60", label: "31 à 60 j", value: data.late31To60, swatch: "bg-destructive/65" },
    { key: "lateOver60", label: "Plus de 60 j", value: data.lateOver60, swatch: "bg-destructive" },
  ];
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">À encaisser</CardTitle>
        <CardDescription>
          {total > 0
            ? `${money(total)} facturés et pas encore payés, selon leur retard.`
            : "Tout ce qui a été facturé est payé."}
        </CardDescription>
        <CardAction>
          <Link
            href="/factures"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Factures
            <ArrowRight className="size-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      {total > 0 && (
        <CardContent className="space-y-5">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            {buckets
              .filter((bucket) => bucket.value > 0)
              .map((bucket) => (
                <div
                  key={bucket.key}
                  className={cn("h-full", bucket.swatch)}
                  style={{ width: `${(bucket.value / total) * 100}%` }}
                />
              ))}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {buckets.map((bucket) => (
              <div key={bucket.key}>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("size-2 shrink-0 rounded-full", bucket.swatch)} />
                  {bucket.label}
                </dt>
                <dd
                  className={cn(
                    "mt-0.5 text-sm font-medium tabular-nums",
                    bucket.value === 0 ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {money(bucket.value)}
                </dd>
              </div>
            ))}
          </dl>

          {data.oldest.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Les plus en retard</p>
              <ul className="divide-y divide-border">
                {data.oldest.map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      href={`/factures/${invoice.id}`}
                      className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                    >
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{invoice.number}</span>
                      <span className="min-w-0 flex-1 truncate">{invoice.clientName}</span>
                      <span
                        className={cn(
                          "shrink-0 whitespace-nowrap text-xs tabular-nums",
                          invoice.daysLate > 60 ? "font-medium text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {invoice.daysLate} j
                      </span>
                      <span className="w-24 shrink-0 text-right tabular-nums">{money(invoice.balance, true)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
