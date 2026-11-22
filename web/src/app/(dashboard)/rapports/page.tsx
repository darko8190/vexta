"use client";

import { useState } from "react";
import { ChartBar, Clock, Download, RefreshCw, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { useReportResultQuery, useReportsQuery } from "@/hooks/use-reports";
import { moduleIcon } from "@/lib/module-icons";
import type { ReportSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Pattern 9 — Analytics / Reporting.
 *
 * The rail is the list of reports this company's plan includes, grouped by nothing: the module
 * each one belongs to is said on its own line, because the rail is already the grouping and a
 * second level of nesting in it would stop it being scannable.
 *
 * One report at a time, with its period above it. The table is built from what the API returns:
 * a report decides its own columns, and adding one is a server-side job rather than a new
 * component here.
 */
export default function ReportsPage() {
  const { data, isLoading, isError, error, refetch } = useReportsQuery();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const reports = data ?? [];
  const active = reports.find((r) => r.id === activeId) ?? reports[0];

  const sections: NavSection[] = reports.map((report) => ({
    key: report.id,
    label: report.title,
    icon: moduleIcon(report.icon),
  }));

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Rapports" description="Vos chiffres, rassemblés." />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHeader title="Rapports" description="Vos chiffres, rassemblés." />
        <LoadErrorState
          error={error}
          title="Rapports indisponibles"
          fallback="La liste des rapports n'a pas pu être chargée."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Rapports"
        description="Vos chiffres, rassemblés. Chaque rapport vient d'un module de votre forfait."
      />

      {reports.length === 0 ? (
        <EmptyState
          icon={ChartBar}
          title="Aucun rapport disponible"
          description="Les rapports suivent les modules de votre forfait. Aucun des vôtres n'en propose pour l'instant."
        />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:gap-6">
          <SectionNav
            sections={sections}
            active={active?.id ?? ""}
            onSelect={setActiveId}
            label="Rapports disponibles"
          />

          <div className="min-w-0 flex-1">
            {active && (
              <ReportPanel
                report={active}
                from={from}
                to={to}
                onFromChange={setFrom}
                onToChange={setTo}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportPanel({
  report,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  report: ReportSummary;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  const { data, isLoading, isError, error, refetch, isFetching } = useReportResultQuery(
    report.isImplemented ? report.id : undefined,
    { from: from || undefined, to: to || undefined },
  );

  function downloadCsv() {
    if (!data) return;

    // Semicolons, not commas: Excel in a French locale reads a comma-separated file as one
    // column, and a figure like 1 234,56 contains the comma itself.
    const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
    const lines = [
      data.columns.map((c) => escape(c.label)).join(";"),
      ...data.rows.map((row) => row.map(escape).join(";")),
    ];
    if (data.totals) lines.push(data.totals.map(escape).join(";"));

    // The BOM is what makes Excel open it as UTF-8. Without it every accent arrives broken.
    const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{report.title}</h2>
            <Badge variant="outline">{report.moduleTitle}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{report.description}</p>
        </div>

        {report.isImplemented && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn(isFetching && "animate-spin")} />
              Actualiser
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!data}>
              <Download />
              CSV
            </Button>
          </div>
        )}
      </div>

      {!report.isImplemented ? (
        <EmptyState
          icon={Wrench}
          title="Calcul à venir"
          description="Ce rapport est défini, mais son calcul n'est pas encore en place. Il affichera ses chiffres dès qu'il le sera."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
            <Field className="w-auto">
              <FieldLabel htmlFor="report-from">Du</FieldLabel>
              <Input
                id="report-from"
                type="date"
                value={from}
                onChange={(event) => onFromChange(event.target.value)}
              />
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="report-to">Au</FieldLabel>
              <Input
                id="report-to"
                type="date"
                value={to}
                onChange={(event) => onToChange(event.target.value)}
              />
            </Field>
            {(from || to) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onFromChange("");
                  onToChange("");
                }}
              >
                Depuis le début de l&apos;année
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <LoadErrorState
              error={error}
              title="Rapport indisponible"
              fallback="Ce rapport n'a pas pu être calculé."
              onRetry={() => refetch()}
            />
          ) : !data || data.rows.length === 0 ? (
            <EmptyState
              icon={ChartBar}
              title="Rien à afficher"
              description="Aucune donnée sur cette période. Élargissez les dates pour voir plus loin."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {data.columns.map((column) => (
                      <TableHead
                        key={column.label}
                        className={cn(column.numeric && "text-right")}
                      >
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row, rowIndex) => (
                    // The index is the key: a report's rows have no id of their own — they are
                    // a grouping, not records — and two rows can legitimately read the same.
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell
                          key={cellIndex}
                          className={cn(
                            data.columns[cellIndex]?.numeric && "text-right tabular-nums",
                            cellIndex === 0 && "font-medium",
                          )}
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                {data.totals && (
                  <TableFooter>
                    <TableRow>
                      {data.totals.map((cell, index) => (
                        <TableCell
                          key={index}
                          className={cn(
                            "font-medium",
                            data.columns[index]?.numeric && "text-right tabular-nums",
                          )}
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}

          {data && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5 shrink-0" />
              {data.subtitle ? `${data.subtitle} · ` : ""}
              Calculé le{" "}
              {new Intl.DateTimeFormat("fr-CA", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(data.generatedAt))}
            </p>
          )}
        </>
      )}
    </div>
  );
}
