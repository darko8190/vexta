"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ProjectCostTable as CostTable } from "@/lib/types";

function money(amount: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** The share of the price left once the cost is paid: « 35,2 % », or « — » with nothing sold. */
export function marginPercent(profit: number, revenue: number): string {
  if (revenue <= 0) return "—";
  return `${((profit / revenue) * 100).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %`;
}

/**
 * What the job costs, what it sells for, and what is left.
 *
 * The categories are the project's own sections, so a figure that looks wrong leads straight to
 * the rows behind it. A category with nothing in it still has a line: a table that grows rows as
 * work is filed reads as incomplete, and the zero is the information.
 */
export function ProjectCostTable({ costs, isLoading }: { costs?: CostTable; isLoading: boolean }) {
  if (isLoading || !costs) {
    return <Skeleton className="h-72 w-full" />;
  }

  const profitTone = (value: number) =>
    value < 0 ? "text-destructive" : value > 0 ? "text-foreground" : "text-muted-foreground";

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Catégorie</TableHead>
            <TableHead className="text-right">Coût</TableHead>
            <TableHead className="text-right">Vendant</TableHead>
            <TableHead className="text-right">Bénéfice</TableHead>
            <TableHead className="text-right">Marge</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {costs.lines.map((line) => (
            <TableRow key={line.key}>
              <TableCell className="font-medium">{line.label}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {money(line.cost)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {money(line.revenue)}
              </TableCell>
              <TableCell className={cn("text-right tabular-nums", profitTone(line.profit))}>
                {money(line.profit)}
              </TableCell>
              <TableCell className={cn("text-right tabular-nums", profitTone(line.profit))}>
                {marginPercent(line.profit, line.revenue)}
              </TableCell>
            </TableRow>
          ))}

          {/* The totals row closes the three columns above it before the invoice arithmetic
              below starts, which is a different question: what the client owes. */}
          <TableRow className="border-t-2 border-border bg-muted/40">
            <TableCell className="font-semibold">Total</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{money(costs.totalCost)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{money(costs.subtotal)}</TableCell>
            <TableCell className={cn("text-right font-semibold tabular-nums", profitTone(costs.profit))}>
              {money(costs.profit)}
            </TableCell>
            <TableCell className={cn("text-right font-semibold tabular-nums", profitTone(costs.profit))}>
              {marginPercent(costs.profit, costs.subtotal)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <dl className="space-y-1.5 border-t border-border bg-card p-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Sous-total</dt>
          <dd className="tabular-nums text-foreground">{money(costs.subtotal)}</dd>
        </div>

        {costs.isTaxExempt ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-muted-foreground">
              Taxes
              <Badge variant="secondary">Non taxable</Badge>
            </dt>
            <dd className="tabular-nums text-foreground">{money(0)}</dd>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{costs.tax1Label}</dt>
              <dd className="tabular-nums text-foreground">{money(costs.tax1)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{costs.tax2Label}</dt>
              <dd className="tabular-nums text-foreground">{money(costs.tax2)}</dd>
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-border pt-2 text-base">
          <dt className="font-semibold text-foreground">Total</dt>
          <dd className="font-semibold tabular-nums text-foreground">{money(costs.total)}</dd>
        </div>
      </dl>

      {/* Where the billing stands: the question asked of a job once the work is in. */}
      {costs.invoiced != null && (
      <dl className="grid grid-cols-2 gap-px border-t border-border bg-border text-sm">
        {[
          { label: "Montant facturé", value: costs.invoiced ?? 0, tone: "text-foreground" },
          {
            label: "Restant à facturer",
            value: costs.remainingToInvoice ?? 0,
            tone: (costs.remainingToInvoice ?? 0) > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          },
          { label: "Montant payé", value: costs.paid ?? 0, tone: "text-emerald-700 dark:text-emerald-400" },
          {
            label: "Reste à payer",
            value: costs.remainingToPay ?? 0,
            tone: (costs.remainingToPay ?? 0) > 0 ? "text-destructive" : "text-muted-foreground",
          },
        ].map((item) => (
          <div key={item.label} className="bg-card p-3">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className={cn("mt-0.5 text-base font-semibold tabular-nums", item.tone)}>{money(item.value)}</dd>
          </div>
        ))}
      </dl>
      )}
    </div>
  );
}
