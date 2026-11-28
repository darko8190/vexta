"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSetLabourRate } from "@/hooks/use-timesheets";
import { ApiError } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ProjectCostLine, ProjectCostTable as CostTable } from "@/lib/types";

/** What each line adds up, in the words the office uses, for the window its title opens. */
const explanations: Record<string, { cost: string; revenue: string; note?: string }> = {
  materiaux: {
    cost: "La quantité de chaque matériau multipliée par son prix d'achat.",
    revenue: "La quantité de chaque matériau multipliée par son prix de vente.",
    note: "Les matériaux d'un assemblage comptent dans la ligne Assemblages, pas ici.",
  },
  equipements: {
    cost: "La quantité de chaque équipement multipliée par son taux coûtant.",
    revenue: "La quantité de chaque équipement multipliée par son taux vendant.",
  },
  assemblages: {
    cost: "La quantité de chaque assemblage multipliée par son coût unitaire.",
    revenue: "La quantité de chaque assemblage multipliée par son prix unitaire.",
  },
  "feuilles-de-temps": {
    cost: "Aucun : ce qu'une heure coûte à l'entreprise relève de la paie, qui n'est pas suivie ici.",
    revenue: "Les heures de chaque ligne de main-d'œuvre multipliées par le taux horaire de cette ligne.",
    note: "Les heures sont arrondies au quart d'heure. Un punch encore en cours ne compte pas avant d'être terminé.",
  },
  "main-oeuvre": {
    cost: "Les heures prévues multipliées par leur coût unitaire.",
    revenue: "Les heures prévues multipliées par leur prix unitaire.",
  },
  depenses: {
    cost: "La somme du coût de chaque dépense.",
    revenue: "La somme du prix de vente de chaque dépense.",
  },
  "frais-supplementaires": {
    cost: "La somme du coût de chaque frais supplémentaire.",
    revenue: "La somme du prix de vente de chaque frais supplémentaire.",
  },
};

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
export function ProjectCostTable({
  costs,
  isLoading,
  projectId,
  canEditRate = false,
}: {
  costs?: CostTable;
  isLoading: boolean;
  /** On a project's page: lets the labour rate be changed for every labour line at once. */
  projectId?: string;
  canEditRate?: boolean;
}) {
  const [explaining, setExplaining] = useState<ProjectCostLine | null>(null);

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
              <TableCell className="font-medium">
                <button
                  type="button"
                  onClick={() => setExplaining(line)}
                  className="text-left underline decoration-dotted underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  title="Voir ce qui est calculé"
                >
                  {line.label}
                </button>
                {line.key === "feuilles-de-temps" && projectId && (
                  <LabourRateField
                    projectId={projectId}
                    rate={costs.labourRate ?? null}
                    hours={costs.labourHours ?? 0}
                    canEdit={canEditRate}
                  />
                )}
              </TableCell>
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

      <Dialog open={explaining !== null} onOpenChange={(open) => !open && setExplaining(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{explaining?.label}</DialogTitle>
            <DialogDescription>Ce qui est calculé dans cette ligne.</DialogDescription>
          </DialogHeader>
          {explaining && (
            <dl className="space-y-3 px-4 text-sm">
              <div>
                <dt className="font-medium text-foreground">Coût — {money(explaining.cost)}</dt>
                <dd className="text-muted-foreground">{explanations[explaining.key]?.cost ?? "La somme des coûts de la section."}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Vendant — {money(explaining.revenue)}</dt>
                <dd className="text-muted-foreground">
                  {explanations[explaining.key]?.revenue ?? "La somme des prix de vente de la section."}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Bénéfice — {money(explaining.profit)}</dt>
                <dd className="text-muted-foreground">
                  Le vendant moins le coût. La marge est ce bénéfice divisé par le vendant ({marginPercent(explaining.profit, explaining.revenue)}).
                </dd>
              </div>
              {explanations[explaining.key]?.note && (
                <p className="text-muted-foreground">{explanations[explaining.key]?.note}</p>
              )}
            </dl>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Fermer</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The hourly rate beside the labour line. Changing it puts the new rate on every labour line of
 * the job. Blank when the lines are at different rates.
 */
function LabourRateField({
  projectId,
  rate,
  hours,
  canEdit,
}: {
  projectId: string;
  rate: number | null;
  hours: number;
  canEdit: boolean;
}) {
  const save = useSetLabourRate(projectId);
  const [value, setValue] = useState<string | null>(null);
  const shown = value ?? (rate == null ? "" : String(rate));

  async function commit() {
    if (value === null) return;
    const next = Number(value.replace(",", "."));
    if (value.trim() === "" || !Number.isFinite(next) || next < 0 || next === rate) {
      setValue(null);
      return;
    }
    try {
      await save.mutateAsync(next);
      toast.success("Taux horaire appliqué à toute la main-d'œuvre du projet.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de changer le taux horaire.");
    } finally {
      setValue(null);
    }
  }

  return (
    <div className="mt-1 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
      <span className="tabular-nums">{hours.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} h ×</span>
      {canEdit ? (
        <Input
          aria-label="Taux horaire de la main-d'œuvre"
          inputMode="decimal"
          className="h-7 w-20 px-2 text-right text-xs tabular-nums"
          value={shown}
          placeholder="Mixte"
          disabled={save.isPending}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setValue(null);
          }}
        />
      ) : (
        <span className="tabular-nums">{rate == null ? "taux mixtes" : money(rate)}</span>
      )}
      <span>$/h</span>
    </div>
  );
}
