"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WorkDay } from "@/hooks/use-work-days";
import { formatDateOnly } from "@/lib/dates";

export function hoursText(value: number): string {
  return `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(value)} h`;
}

export function timeOfDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
}

/**
 * Days as a table: start, end, break, the day's hours, and the hours pointed on projects beside
 * them — the gap between the two is the time that was on no job.
 */
export function WorkDaysTable({ days, showEmployee }: { days: WorkDay[]; showEmployee?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            {showEmployee && <TableHead>Employé</TableHead>}
            <TableHead>Début</TableHead>
            <TableHead>Fin</TableHead>
            <TableHead className="text-right">Pause</TableHead>
            <TableHead className="text-right">Journée</TableHead>
            <TableHead className="text-right">Poinçons</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => (
            <TableRow key={day.id}>
              <TableCell className="tabular-nums">{formatDateOnly(day.date)}</TableCell>
              {showEmployee && <TableCell className="font-medium">{day.employeeName}</TableCell>}
              <TableCell className="tabular-nums">{timeOfDay(day.startedAt)}</TableCell>
              <TableCell className="tabular-nums">
                {day.endedAt ? timeOfDay(day.endedAt) : <Badge variant="default">En cours</Badge>}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {day.breakMinutes > 0 ? `${day.breakMinutes} min` : "—"}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{hoursText(day.hours)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{hoursText(day.projectHours)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
