"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { WorkDaysTable } from "@/components/work/work-days-table";
import { EmployeeMultiSelect } from "@/components/team/employee-multi-select";
import { useWorkDaysQuery } from "@/hooks/use-work-days";
import { dayIso, todayIso } from "@/lib/dates";

/** Every employee's days, for the office: who started when, and how the day compares to the poinçons. */
export function WorkDaysSection() {
  const [from, setFrom] = useState(dayIso(-13));
  const [to, setTo] = useState(todayIso());
  const [employees, setEmployees] = useState<string[]>([]);
  const { data: all, isLoading, isError, error, refetch } = useWorkDaysQuery(from, to);
  const data = all?.filter((day) => employees.length === 0 || employees.includes(day.employeeId));

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Feuilles de temps de jour</h2>
        <p className="text-sm text-muted-foreground">
          La journée de chaque employé, commencée et terminée par lui. Les heures sur les projets sont dans Poinçons.
        </p>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field className="w-auto">
          <FieldLabel htmlFor="days-from">Du</FieldLabel>
          <Input id="days-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="days-to">Au</FieldLabel>
          <Input id="days-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <EmployeeMultiSelect value={employees} onChange={setEmployees} />
      </div>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : isError && !all ? (
        <LoadErrorState error={error} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Aucune journée"
          description="Les employés commencent leur journée depuis « Mes assignations »."
        />
      ) : (
        <WorkDaysTable days={data} showEmployee />
      )}
    </div>
  );
}
