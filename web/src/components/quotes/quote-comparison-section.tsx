"use client";

import { useState } from "react";
import Link from "next/link";
import { FileDiff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useQuoteComparisonQuery } from "@/hooks/use-quotes";
import { formatAmount } from "@/lib/money";
import type { QuoteLineChange, QuoteLineChangeRow, QuoteLineKind, QuoteLineSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

const kindLabels: Record<QuoteLineKind, string> = {
  Tache: "Tâche",
  Materiel: "Matériau",
  Frais: "Frais",
};

const changeLabels: Record<QuoteLineChange, string> = {
  Ajoutee: "Ajoutée",
  Retiree: "Retirée",
  Modifiee: "Modifiée",
  Inchangee: "Inchangée",
};

const changeVariants: Record<QuoteLineChange, "default" | "secondary" | "outline" | "destructive"> = {
  Ajoutee: "default",
  Retiree: "destructive",
  Modifiee: "secondary",
  Inchangee: "outline",
};

function quantity(value: number): string {
  return value.toLocaleString("fr-CA", { maximumFractionDigits: 3 });
}

/** « 12 h × 80,00 $ = 960,00 $ », with « option » when it is one. */
function describe(line: QuoteLineSnapshot | null) {
  if (!line) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {quantity(line.quantity)}
      {line.unit ? ` ${line.unit}` : ""} × {formatAmount(line.unitPrice)} ={" "}
      <span className="font-medium text-foreground">{formatAmount(line.total)}</span>
      {line.isOptional && <span className="text-muted-foreground"> (option)</span>}
    </span>
  );
}

/** What a line adds to or takes from the price; an option not taken counts for nothing. */
function counted(line: QuoteLineSnapshot | null): number {
  if (!line || (line.isOptional && !line.isSelected)) return 0;
  return line.total;
}

function Difference({ amount, className }: { amount: number; className?: string }) {
  const rounded = Math.round(amount * 100) / 100;
  if (rounded === 0) return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <span className={cn("tabular-nums", rounded > 0 ? "text-foreground" : "text-destructive", className)}>
      {rounded > 0 ? "+" : "−"}
      {formatAmount(Math.abs(rounded))}
    </span>
  );
}

/**
 * A revision set against the version it replaces: what was added, removed or changed, and what
 * it does to the price. Answers the client's « qu'est-ce qui a changé ? » without opening both.
 */
export function QuoteComparisonSection({ quoteId }: { quoteId: string }) {
  const { data, isLoading, isError, error, refetch } = useQuoteComparisonQuery(quoteId, true);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const header = (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-foreground">Changements</h2>
      <p className="text-sm text-muted-foreground">
        Ce qui a changé depuis la version précédente{data ? ` (${data.previousLabel})` : ""}.
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div>
        {header}
        <LoadErrorState
          error={error}
          title="Comparaison indisponible"
          fallback="La comparaison avec la version précédente n'a pas pu être chargée."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const changed = data.lines.filter((line) => line.change !== "Inchangee");
  const unchanged = data.lines.length - changed.length;
  const rows: QuoteLineChangeRow[] = showUnchanged ? data.lines : changed;

  return (
    <div>
      {header}

      <dl className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">
            <Link href={`/soumissions/${data.previousId}`} className="underline-offset-4 hover:underline">
              {data.previousLabel}
            </Link>
            , avant taxes
          </dt>
          <dd className="font-medium tabular-nums text-foreground">{formatAmount(data.previousSubtotal)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cette version, avant taxes</dt>
          <dd className="font-medium tabular-nums text-foreground">{formatAmount(data.subtotal)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Écart</dt>
          <dd className="font-medium">
            <Difference amount={data.subtotal - data.previousSubtotal} />
          </dd>
        </div>
      </dl>

      {changed.length === 0 && !showUnchanged ? (
        <EmptyState
          icon={FileDiff}
          title="Aucune ligne n'a changé"
          description="Les lignes sont les mêmes que dans la version précédente."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ligne</TableHead>
                <TableHead>Changement</TableHead>
                <TableHead>Avant</TableHead>
                <TableHead>Après</TableHead>
                <TableHead className="text-right">Écart</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((line, index) => (
                <TableRow key={`${line.kind}-${line.description}-${index}`}>
                  <TableCell className="max-w-72">
                    <span className="line-clamp-2 whitespace-normal">{line.description}</span>
                    <span className="text-xs text-muted-foreground">{kindLabels[line.kind]}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={changeVariants[line.change]}>{changeLabels[line.change]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{describe(line.before)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{describe(line.after)}</TableCell>
                  <TableCell className="text-right">
                    <Difference amount={counted(line.after) - counted(line.before)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {unchanged > 0 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowUnchanged((value) => !value)}>
          {showUnchanged
            ? "Masquer les lignes inchangées"
            : unchanged === 1
              ? "Afficher la ligne inchangée"
              : `Afficher les ${unchanged} lignes inchangées`}
        </Button>
      )}
    </div>
  );
}
