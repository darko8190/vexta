"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuoteStatsQuery } from "@/hooks/use-quotes";
import { formatAmount } from "@/lib/money";

const DAYS = 90;

/**
 * What became of the prices given over the last three months: how many went out, how many
 * came back as jobs, and what that is worth. Counted by the day they were sent, so the rate
 * reads « of what we quoted then, this much became work ».
 *
 * Absent for a company that has sent none in the period: an empty rate is not information.
 */
export function QuoteStatsCard() {
  const { data } = useQuoteStatsQuery(DAYS);
  if (!data || data.sent === 0) return null;

  const figures = [
    { label: "Envoyées", value: data.sent },
    { label: "Acceptées", value: data.accepted },
    { label: "Refusées", value: data.refused },
    { label: "Expirées", value: data.expired },
    { label: "En attente", value: data.pending },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Soumissions des {DAYS} derniers jours</CardTitle>
        <Link
          href="/soumissions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Toutes les soumissions
          <ArrowRight className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-sm text-muted-foreground">Taux d&apos;acceptation</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {data.acceptanceRate == null
                ? "—"
                : `${data.acceptanceRate.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %`}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.acceptanceRate == null
                ? "Aucune n'a encore reçu de réponse."
                : "Acceptées sur celles qui ont eu une réponse ou qui ont expiré."}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Acceptées, avant taxes</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{formatAmount(data.acceptedAmount)}</p>
            <p className="text-xs text-muted-foreground">sur {formatAmount(data.sentAmount)} soumis</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-5">
          {figures.map((figure) => (
            <div key={figure.label}>
              <dt className="text-muted-foreground">{figure.label}</dt>
              <dd className="font-medium tabular-nums text-foreground">{figure.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
