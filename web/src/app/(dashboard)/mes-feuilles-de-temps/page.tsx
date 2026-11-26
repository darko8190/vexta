"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { useMyWeekQuery } from "@/hooks/use-my-work";
import { useMyWorkDaysQuery } from "@/hooks/use-work-days";
import { WorkDaysTable } from "@/components/work/work-days-table";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { formatProjectNumber } from "@/lib/types";

/** The hours as the sheet writes them: « 8,25 h ». A whole number keeps no decimals. */
function hours(value: number): string {
  return `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(value)} h`;
}

/** "07:52" said the way the trade says it: 7 h 52. */
function clock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${Number(match[1])} h ${match[2]}` : value;
}

/** The weekday, so a row can be read without working the date out. */
function weekday(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const label = new Date(year, month - 1, day).toLocaleDateString("fr-CA", { weekday: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** The same day a number of weeks away, as YYYY-MM-DD in the browser's own time zone. */
function weekAway(iso: string, weeks: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + weeks * 7);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/**
 * My own hours, one week at a time.
 *
 * The same rows the foreman reads on a project, asked the other way round: across every job,
 * for one person, for one week. That is the question somebody asks on a Thursday night — "est-ce
 * que mes heures sont rentrées" — and answering it by opening five projects is how nobody ever
 * checks.
 *
 * Read-only on purpose. Hours are filed against the job they were worked on, and a sheet that
 * let somebody add hours with no project would create a cost nobody can charge for.
 */
export default function MyTimesheetsPage() {
  // Anchored on a day rather than on a week number: the server decides where Monday falls, and
  // stepping by seven days from any day in a week lands in the week beside it.
  const [anchor, setAnchor] = useState(todayIso());
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useMyWeekQuery(anchor);

  const entries = data?.entries ?? [];
  // The way back, offered only once somebody has walked away from today.
  const hasMoved = anchor !== todayIso();

  return (
    <div>
      <PageHeader
        title="Mes feuilles de temps"
        description="Vos journées, et les heures pointées sur les projets, semaine par semaine."
      />

      <MyWorkDays from={data?.weekStart} to={data?.weekEnd} />

      <h2 className="mb-2 text-base font-semibold text-foreground">Mes poinçons</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Semaine précédente"
          onClick={() => setAnchor((current) => weekAway(current, -1))}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Semaine suivante"
          onClick={() => setAnchor((current) => weekAway(current, 1))}
        >
          <ChevronRight />
        </Button>

        <div className="min-w-0 flex-1 text-sm">
          {data ? (
            <span className="font-medium text-foreground">
              Du {formatDateOnly(data.weekStart)} au {formatDateOnly(data.weekEnd)}
            </span>
          ) : (
            <Skeleton className="h-5 w-48" />
          )}
        </div>

        {hasMoved && (
          <Button variant="ghost" size="sm" onClick={() => setAnchor(todayIso())}>
            Cette semaine
          </Button>
        )}

        {/* The total of the week on screen, beside the week it belongs to. */}
        <Badge variant="secondary" className="tabular-nums">
          {data ? hours(data.totalHours) : "—"}
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={error}
          title="Feuilles de temps indisponibles"
          fallback="Vos heures n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : data && !data.hasEmployeeRecord ? (
        <EmptyState
          icon={CalendarClock}
          title="Aucun dossier d'employé"
          description="Votre compte n'est rattaché à aucun employé, donc aucune heure ne peut être à votre nom. Un administrateur peut vous ajouter dans Ressources humaines."
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Aucune heure cette semaine"
          description="Les heures s'inscrivent depuis le projet sur lequel elles ont été travaillées, dans son onglet Poinçons."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jour</TableHead>
                <TableHead>Projet</TableHead>
                {/* Hidden on a phone: the day, the job and the total are what the week is read
                    for, and the two clock times are the detail behind the total. */}
                <TableHead className="hidden sm:table-cell">Quart</TableHead>
                <TableHead className="text-right">Heures</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{weekday(entry.startDate)}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatDateOnly(entry.startDate)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projets/${entry.projectId}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {formatProjectNumber(entry.projectNumber)}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {entry.clientName}
                      {entry.note ? ` — ${entry.note}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                    {clock(entry.startTime)} → {clock(entry.endTime)}
                    {/* Said only when it is true, which is rare and is exactly when it matters. */}
                    {entry.startDate !== entry.endDate && (
                      <span className="ml-1 text-xs">(+1 j)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium text-foreground tabular-nums">
                    {hours(entry.hours)}
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

/** My days in the week on screen: when I started and ended, beside what I pointed on projects. */
function MyWorkDays({ from, to }: { from?: string; to?: string }) {
  const { data } = useMyWorkDaysQuery(from ?? "", to ?? "");
  if (!from || !to || !data) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-base font-semibold text-foreground">Mes journées</h2>
      {data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Aucune journée cette semaine. Elles se commencent depuis « Mes assignations ».
        </p>
      ) : (
        <WorkDaysTable days={data} />
      )}
    </section>
  );
}
