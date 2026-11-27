"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/layout/clickable-row";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { QuoteLineFormSheet, quoteLineCopy } from "@/components/quotes/quote-line-form-sheet";
import { useDeleteQuoteLine, useQuoteLinesQuery } from "@/hooks/use-quotes";
import { ApiError } from "@/lib/api";
import { marginPercent } from "@/components/projects/detail/project-cost-table";
import { formatAmount } from "@/lib/money";
import type { QuoteLine, QuoteLineKind } from "@/lib/types";
import type { LucideIcon } from "lucide-react";

const headings: Record<QuoteLineKind, { title: string; description: string; empty: string }> = {
  Tache: {
    title: "Tâches",
    description: "La main-d'œuvre : chaque tâche, ses heures et son taux. Elles deviennent les tâches du projet.",
    empty: "Ajoutez les étapes du travail et les heures prévues pour chacune.",
  },
  Materiel: {
    title: "Matériaux",
    description: "Ce qui sera fourni et installé. Ils deviennent les matériaux du projet, aux prix soumis.",
    empty: "Ajoutez des produits du catalogue ou décrivez-les à la main.",
  },
  Frais: {
    title: "Frais supplémentaires",
    description: "Déplacements, location, permis : ce qui s'ajoute au prix. Ils deviennent les frais du projet.",
    empty: "Ajoutez ce qui s'ajoute au prix en dehors des heures et des matériaux.",
  },
  Equipement: {
    title: "Équipements",
    description: "La machinerie et les outils facturés au travail. Ils deviennent les équipements du projet.",
    empty: "Ajoutez un équipement de votre liste ou décrivez-le à la main.",
  },
  Assemblage: {
    title: "Assemblages",
    description: "Des ensembles prêts à poser. Leurs matériaux s'ajoutent selon la quantité, et le prix reste sur l'assemblage.",
    empty: "Ajoutez un assemblage : ses matériaux viennent avec lui.",
  },
};

function quantity(value: number) {
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 3 }).format(value);
}

/**
 * One kind of line on a quote — its tasks, its materials or its extra charges — as a table with
 * its own total. Pressing a row opens it; while the quote is still a quote, that is an edit.
 */
export function QuoteLinesSection({
  quoteId,
  kind,
  icon,
  locked,
  wageClassificationId,
}: {
  quoteId: string;
  kind: QuoteLineKind;
  icon: LucideIcon;
  locked: boolean;
  wageClassificationId: string | null;
}) {
  const { data, isLoading, isError, error, refetch } = useQuoteLinesQuery(quoteId, kind);
  // The materials an assembly brought say which one; the assemblies say how many they brought.
  const { data: related } = useQuoteLinesQuery(quoteId, kind === "Materiel" ? "Assemblage" : kind === "Assemblage" ? "Materiel" : undefined);
  const parentName = (id: string | null | undefined) => related?.find((line) => line.id === id)?.description;
  const remove = useDeleteQuoteLine(quoteId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<QuoteLine | undefined>(undefined);
  const [deleting, setDeleting] = useState<QuoteLine | undefined>(undefined);

  const copy = quoteLineCopy[kind];
  const heading = headings[kind];
  const lines = data ?? [];
  // Options not taken are outside the price, so outside these totals too — and an assembly's
  // materials, whose money is the assembly's.
  const counted = lines.filter((line) => !line.parentLineId && (!line.isOptional || line.isSelected));
  const total = counted.reduce((sum, line) => sum + line.total, 0);
  const cost = counted.reduce((sum, line) => sum + line.quantity * (line.unitCost ?? 0), 0);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  const addButton = locked ? undefined : (
    <Button onClick={openCreate}>
      <Plus />
      {copy.create}
    </Button>
  );

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Ligne supprimée.");
      setDeleting(undefined);
    } catch (problem) {
      toast.error(problem instanceof ApiError ? problem.message : "Impossible de supprimer la ligne.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{heading.title}</h2>
          <p className="text-sm text-muted-foreground">{heading.description}</p>
        </div>
        {addButton}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Lignes indisponibles"
          fallback="Les lignes de cette soumission n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : lines.length === 0 ? (
        <EmptyState icon={icon} title={`Aucune ligne : ${heading.title.toLowerCase()}`} description={heading.empty} action={addButton} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                {kind !== "Frais" && <TableHead className="text-right">{copy.quantity}</TableHead>}
                <TableHead className="text-right">Coûtant</TableHead>
                <TableHead className="text-right">Vendant</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Marge</TableHead>
                {!locked && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const cells = (
                  <>
                    <TableCell className="max-w-80">
                      <span className="line-clamp-2 whitespace-normal">{line.description}</span>
                      {line.isOptional && (
                        <Badge variant={line.isSelected ? "secondary" : "outline"} className="mt-0.5 mr-1">
                          {line.isSelected ? "Option retenue" : "Option, hors total"}
                        </Badge>
                      )}
                      {line.parentLineId && (
                        <Badge variant="outline" className="mt-0.5 mr-1">
                          Dans l&apos;assemblage {parentName(line.parentLineId) ?? ""} · hors total
                        </Badge>
                      )}
                      {kind === "Assemblage" && related && (
                        <span className="mr-1 text-xs text-muted-foreground">
                          {related.filter((child) => child.parentLineId === line.id).length} matériau(x)
                        </span>
                      )}
                      {line.code && <span className="text-xs text-muted-foreground">{line.code}</span>}
                    </TableCell>
                    {kind !== "Frais" && (
                      <TableCell className="text-right tabular-nums">
                        {quantity(line.quantity)}
                        {line.unit && <span className="text-muted-foreground"> {line.unit}</span>}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {line.unitCost != null ? formatAmount(line.unitCost) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(line.unitPrice)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatAmount(line.total)}</TableCell>
                    <TableCell
                      className="text-right tabular-nums text-muted-foreground"
                      title={line.unitCost == null ? "Pas de coûtant : la marge ne peut pas être calculée." : undefined}
                    >
                      {line.unitCost == null ? "—" : marginPercent(line.unitPrice - line.unitCost, line.unitPrice)}
                    </TableCell>
                  </>
                );
                // An assembly's material follows its assembly: changed there, not here.
                return locked || line.parentLineId ? (
                  <TableRow key={line.id} className={line.parentLineId ? "text-muted-foreground" : undefined}>
                    {cells}
                    {!locked && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Retirer ${line.description}`}
                          onClick={() => setDeleting(line)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ) : (
                  <ClickableRow
                    key={line.id}
                    label={`Modifier ${line.description}`}
                    onOpen={() => {
                      setEditing(line);
                      setFormOpen(true);
                    }}
                  >
                    {cells}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Supprimer ${line.description}`}
                        onClick={() => setDeleting(line)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </ClickableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                {kind !== "Frais" && <TableCell />}
                <TableCell className="text-right tabular-nums">{formatAmount(Math.round(cost * 100) / 100)}</TableCell>
                <TableCell />
                <TableCell className="text-right font-semibold tabular-nums">{formatAmount(total)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {/* A line with no cost would count as free and inflate the section's margin. */}
                  {counted.some((line) => line.unitCost == null) ? "—" : marginPercent(total - cost, total)}
                </TableCell>
                {!locked && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <QuoteLineFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        quoteId={quoteId}
        kind={kind}
        line={editing}
        wageClassificationId={wageClassificationId}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(undefined)}
        title="Supprimer cette ligne ?"
        description={deleting ? `« ${deleting.description} » sera retirée de la soumission.` : ""}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
