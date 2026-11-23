"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useWorkTasksQuery } from "@/hooks/use-work";
import { formatDateOnly } from "@/lib/dates";
import { taskPriorityLabels, taskStatusBadgeVariant, taskStatusLabels } from "@/lib/labels";
import { formatProjectNumber } from "@/lib/types";
import type { ProjectTaskStatus } from "@/lib/types";

/** The value the "everything open" row carries: a Select cannot hold undefined as an item. */
const OPEN = "ouvertes";

const statuses: ProjectTaskStatus[] = ["AFaire", "EnCours", "Bloquee", "Terminee"];

/**
 * Every task in the company, ordered by what is due first.
 *
 * Read-only on purpose. A task is edited on the job it belongs to, where its project, its crew
 * and its estimate are all on screen; editing one from here would mean a form that has to fetch
 * the rest of its own context to be safe to save.
 *
 * It opens on what is still open rather than on everything. A list that led with three years of
 * finished work would be a list nobody reads twice.
 */
export function WorkTasksSection() {
  const [status, setStatus] = useState<string>(OPEN);
  const { data, isLoading, isError, error, refetch } = useWorkTasksQuery({
    status: status === OPEN ? undefined : (status as ProjectTaskStatus),
  });

  const tasks = data ?? [];
  const late = tasks.filter((task) => task.isLate).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Tâches</h2>
          <p className="text-sm text-muted-foreground">
            Tout ce qu&apos;il reste à faire, tous les chantiers ensemble.
            {late > 0 && ` ${late} en retard.`}
          </p>
        </div>

        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="tasks-status">État</FieldLabel>
          <Select value={status} onValueChange={(value) => setStatus(value ?? OPEN)}>
            <SelectTrigger id="tasks-status" className="w-full">
              <SelectValue>
                {(value: string) =>
                  value === OPEN ? "Tout ce qui est ouvert" : taskStatusLabels[value as ProjectTaskStatus]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OPEN}>Tout ce qui est ouvert</SelectItem>
              {statuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {taskStatusLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
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
          title="Tâches indisponibles"
          fallback="Les tâches n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={status === OPEN ? "Rien à faire" : "Aucune tâche dans cet état"}
          description="Les tâches se créent sur le projet auquel elles appartiennent, où leur équipe et leur échéance sont à l'écran."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tâche</TableHead>
                <TableHead>Projet</TableHead>
                <TableHead>Assignée à</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>État</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">{task.title}</p>
                    {/* Only when it is not the middle. Normale on every row would be a column
                        of the word "normal". */}
                    {task.priority !== "Normale" && (
                      <Badge variant="outline" className="mt-1">
                        {taskPriorityLabels[task.priority]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projets/${task.projectId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatProjectNumber(task.projectNumber)}
                      </span>{" "}
                      {task.clientName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {/* A crew survives somebody leaving it and a list of names survives the crew
                        being reshuffled, so both are kept and both are shown. A task on nobody
                        is a real state, and the cell says so instead of inventing an owner. */}
                    {task.assignedTeamName ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        {task.assignedTeamName}
                      </span>
                    ) : task.assigneeNames.length > 0 ? (
                      task.assigneeNames.join(", ")
                    ) : (
                      "Personne"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {task.dueDate ? (
                      <span className={task.isLate ? "font-medium text-destructive" : "text-muted-foreground"}>
                        {formatDateOnly(task.dueDate)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={taskStatusBadgeVariant[task.status]}>
                      {taskStatusLabels[task.status]}
                    </Badge>
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
