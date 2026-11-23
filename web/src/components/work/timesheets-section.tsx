"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useWorkTimesheetsQuery } from "@/hooks/use-work";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { formatProjectNumber } from "@/lib/types";

/** The Monday of the week a day falls in — the week a Québec payroll runs on. */
function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return isoOf(date);
}

function shiftWeek(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoOf(date);
}

function isoOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The hours as a sheet writes them: « 8,25 h ». A whole number keeps no decimals. */
function hours(value: number): string {
  return `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(value)} h`;
}

/** "07:52" said the way the trade says it: 7 h 52. */
function clock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${Number(match[1])} h ${match[2]}` : value;
}

/** The weekday, so a row reads without working the date out. */
function weekday(iso: string): string {
  const label = new Date(`${iso}T00:00:00`).toLocaleDateString("fr-CA", { weekday: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Every hour filed in one week, across every job.
 *
 * Read-only, and it says so in the empty state. Hours are entered on the job they were worked
 * on, where the project and its lock are on screen; a second place to type them would be a
 * second place for a week to be entered twice.
 *
 * The week is moved with the arrows and the total comes from the server, not from the rows: the
 * table stops at 200 lines, and a footer that added up a truncated page would understate a busy
 * fortnight without saying so.
 */
export function WorkTimesheetsSection() {
  const [week, setWeek] = useState(() => mondayOf(todayIso()));
  // Monday to Sunday, both ends inclusive — the API filters with >= and <=, so handing it the
  // next Monday would quietly bill eight days as a week.
  const { data, isLoading, isError, error, refetch } = useWorkTimesheetsQuery({
    from: week,
    to: addDays(week, 6),
  });

  const rows = data?.rows ?? [];
  const thisWeek = mondayOf(todayIso());

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Feuilles de temps</h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? `Du ${formatDateOnly(data.from)} au ${formatDateOnly(data.to)} · ${hours(data.totalHours)} au total`
              : "Les heures de toute l'équipe, toutes les feuilles ensemble."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Semaine précédente"
            onClick={() => setWeek(shiftWeek(week, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={week === thisWeek}
            onClick={() => setWeek(thisWeek)}
          >
            Cette semaine
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Semaine suivante"
            onClick={() => setWeek(shiftWeek(week, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Feuilles de temps indisponibles"
          fallback="Les heures n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Aucune heure cette semaine"
          description="Les heures se saisissent sur le projet où elles ont été travaillées. Changez de semaine avec les flèches."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jour</TableHead>
                  <TableHead>Employé</TableHead>
                  <TableHead>Projet</TableHead>
                  <TableHead>Plage</TableHead>
                  <TableHead className="text-right">Heures</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-muted-foreground">{weekday(row.startDate)}</span>{" "}
                      {formatDateOnly(row.startDate)}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {/* An employee removed from the payroll leaves their hours behind. The
                          row says so instead of showing a blank cell. */}
                      {row.employeeName ?? (
                        <span className="text-muted-foreground">Employé retiré</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/projets/${row.projectId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatProjectNumber(row.projectNumber)}
                        </span>{" "}
                        {row.clientName}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {clock(row.startTime)} → {clock(row.endTime)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{hours(row.hours)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Only when the table hit the API's ceiling. Saying nothing on a period with four
              hundred entries would leave a table quietly disagreeing with its own total. */}
          {rows.length >= 200 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Les 200 premières lignes sont affichées. Le total ci-dessus couvre toute la période.
            </p>
          )}
        </>
      )}
    </div>
  );
}
