"use client";

import Link from "next/link";
import { AlertTriangle, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { recurrenceLabel, useRecurringInvoicesQuery } from "@/hooks/use-recurring-invoices";
import { formatDateOnly } from "@/lib/dates";

/**
 * Every invoice that comes back on a schedule, the next due first. Made from an invoice's own
 * page (« Rendre récurrente »), so this list only shows them and leads there.
 */
export function RecurringInvoicesSection() {
  const { data, isLoading, isError, error, refetch } = useRecurringInvoicesQuery();

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Factures récurrentes</h2>
        <p className="text-sm text-muted-foreground">
          Les contrats facturés à chaque période. Pour en ajouter une, ouvrez une facture et
          choisissez « Rendre récurrente ».
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Factures récurrentes indisponibles"
          fallback="La liste des factures récurrentes n'a pas pu être chargée."
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Aucune facture récurrente"
          description="Ouvrez la facture d'un contrat d'entretien ou d'un service au mois, puis « Rendre récurrente » : elle reviendra toute seule."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Modèle</TableHead>
                <TableHead>Fréquence</TableHead>
                <TableHead>Prochaine</TableHead>
                <TableHead>Envoi</TableHead>
                <TableHead>Dernière</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-48">
                    <Link href={`/clients/${row.clientId}`} className="block truncate underline-offset-4 hover:underline">
                      {row.clientName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    <Link href={`/factures/${row.sourceInvoiceId}`} className="underline-offset-4 hover:underline">
                      {row.sourceInvoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{recurrenceLabel(row.intervalMonths)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.isActive ? formatDateOnly(row.nextIssueDate) : <Badge variant="outline">Terminée</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.autoSend ? "Automatique" : "Brouillon"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {row.lastInvoiceId && row.lastInvoiceNumber ? (
                        <Link
                          href={`/factures/${row.lastInvoiceId}`}
                          className="font-mono text-xs tabular-nums underline-offset-4 hover:underline"
                        >
                          {row.lastInvoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {row.lastProblem && (
                        <AlertTriangle className="size-4 text-destructive" aria-label={row.lastProblem}>
                          <title>{row.lastProblem}</title>
                        </AlertTriangle>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
