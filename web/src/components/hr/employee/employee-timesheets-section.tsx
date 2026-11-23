"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useEmployeeWeekQuery } from "@/hooks/use-employee-file";
import { formatDateOnly, todayIso } from "@/lib/dates";
import { formatProjectNumber } from "@/lib/types";

function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shiftWeek(iso: string, weeks: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + weeks * 7);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The hours this person filed, week by week.
 *
 * Read-only here. Hours are filed against the job they were worked on, which is where the
 * project, the rate and the invoice all are; a second place to enter them would be a second
 * version of the same afternoon.
 */
export function EmployeeTimesheetsSection({ employeeId }: { employeeId: string }) {
  const [week, setWeek] = useState(() => mondayOf(todayIso()));
  const { data, isLoading, isError, error, refetch } = useEmployeeWeekQuery(employeeId, week);

  const entries = data?.entries ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Feuilles de temps</h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? `Semaine du ${formatDateOnly(data.weekStart)} au ${formatDateOnly(data.weekEnd)} · ${data.totalHours.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} h`
              : "Les heures travaillées, semaine par semaine."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Semaine précédente" onClick={() => setWeek(shiftWeek(week, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeek(mondayOf(todayIso()))}>
            Cette semaine
          </Button>
          <Button variant="outline" size="icon" aria-label="Semaine suivante" onClick={() => setWeek(shiftWeek(week, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Feuilles de temps indisponibles"
          fallback="Les heures de cette semaine n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Aucune heure cette semaine"
          description="Les heures se saisissent sur le projet où elles ont été travaillées. Changez de semaine avec les flèches."
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/projets/${entry.projectId}`}
                    className="font-mono text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {formatProjectNumber(entry.projectNumber)}
                  </Link>
                  <span className="truncate text-sm text-muted-foreground">{entry.clientName}</span>
                </div>

                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatDateOnly(entry.startDate)} · {entry.startTime} – {entry.endTime}
                  {entry.note ? ` · ${entry.note}` : ""}
                </p>
              </div>

              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {entry.hours.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} h
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
