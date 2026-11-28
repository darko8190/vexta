"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, ListChecks, Play, Plus, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { TaskFormSheet } from "@/components/projects/detail/task-form-sheet";
import { useCanManage } from "@/hooks/use-can-create";
import { useWorkTasksQuery } from "@/hooks/use-work";
import { formatDateOnly } from "@/lib/dates";
import { taskPriorityLabels, taskStatusBadgeVariant, taskStatusLabels } from "@/lib/labels";
import { formatProjectNumber } from "@/lib/types";
import type { ProjectTask, ProjectTaskStatus, WorkTask } from "@/lib/types";
import { BulkActionBar, SelectAllHead, SelectRowCell, useRowSelection, type BulkAction } from "@/components/layout/bulk-actions";

/** The value the "everything open" row carries: a Select cannot hold undefined as an item. */
const OPEN = "ouvertes";
const ALL = "toutes";

const statuses: ProjectTaskStatus[] = ["AFaire", "EnCours", "Bloquee", "Terminee"];

/** The row as the form expects a task. */
function asProjectTask(task: WorkTask): ProjectTask {
  const ids = task.assigneeIds ?? [];
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate ?? null,
    dueDate: task.dueDate,
    estimatedHours: task.estimatedHours ?? null,
    assignedTeamId: task.assignedTeamId ?? null,
    assignedTeamName: task.assignedTeamName,
    assignees: ids.map((id, index) => ({ id, name: task.assigneeNames[index] ?? "", jobTitle: null })),
    completedAt: null,
    isLate: task.isLate,
    sortOrder: 0,
    taskTypeId: task.taskTypeId ?? null,
    taskTypeName: task.taskTypeName ?? null,
    projectId: task.projectId,
  };
}

/**
 * Every task in the company, on a project or on none, grouped by state: À faire, En cours,
 * Bloquée, then Terminée when it is asked for. A task is added here with or without a project,
 * and opened in a panel from its row.
 *
 * It opens on what is still open rather than on everything. A list that led with three years of
 * finished work would be a list nobody reads twice.
 */
export function WorkTasksSection() {
  const [status, setStatus] = useState<string>(OPEN);
  const canManage = useCanManage();
  const { data, isLoading, isError, error, refetch } = useWorkTasksQuery({
    status: status === OPEN || status === ALL ? undefined : (status as ProjectTaskStatus),
  });
  // « Toutes » adds the finished ones, which the API serves as their own state.
  const { data: finished } = useWorkTasksQuery({ status: "Terminee" });
  const [editing, setEditing] = useState<ProjectTask | "new" | null>(null);

  const tasks = status === ALL ? [...(data ?? []), ...(finished ?? [])] : (data ?? []);
  const late = tasks.filter((task) => task.isLate).length;
  const queryClient = useQueryClient();
  const selection = useRowSelection(tasks, (task) => task.id);
  type TaskRow = (typeof tasks)[number];
  const statusAction = (key: string, next: ProjectTaskStatus, label: string, icon: BulkAction<TaskRow>["icon"]): BulkAction<TaskRow> => ({
    key,
    label,
    icon,
    applies: (task) => task.status !== next,
    run: (task) => api.patch(`taches/${task.id}/statut`, { status: next }),
    done: (count) => `${count} tâche(s) : ${taskStatusLabels[next].toLowerCase()}.`,
    finish: () => queryClient.invalidateQueries(),
  });
  const bulkActions: BulkAction<TaskRow>[] = [
    statusAction("encours", "EnCours", "Marquer en cours", Play),
    statusAction("terminee", "Terminee", "Marquer terminée", CircleCheck),
  ];

  const groups = statuses
    .map((state) => ({ state, rows: tasks.filter((task) => task.status === state) }))
    .filter((group) => group.rows.length > 0);

  const addButton = canManage ? (
    <Button onClick={() => setEditing("new")}>
      <Plus />
      Ajouter une tâche
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Tâches</h2>
          <p className="text-sm text-muted-foreground">
            Tout ce qu&apos;il reste à faire, sur les chantiers ou en dehors.
            {late > 0 && ` ${late} en retard.`}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <Field className="w-full sm:w-56">
            <FieldLabel htmlFor="tasks-status">État</FieldLabel>
            <Select value={status} onValueChange={(value) => setStatus(value ?? OPEN)}>
              <SelectTrigger id="tasks-status" className="w-full">
                <SelectValue>
                  {(value: string) =>
                    value === OPEN
                      ? "Tout ce qui est ouvert"
                      : value === ALL
                        ? "Toutes les tâches"
                        : taskStatusLabels[value as ProjectTaskStatus]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OPEN}>Tout ce qui est ouvert</SelectItem>
                <SelectItem value={ALL}>Toutes les tâches</SelectItem>
                {statuses.map((value) => (
                  <SelectItem key={value} value={value}>
                    {taskStatusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {addButton}
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
          title="Tâches indisponibles"
          fallback="Les tâches n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={status === OPEN ? "Rien à faire" : "Aucune tâche dans cet état"}
          description="Une tâche peut appartenir à un projet ou à aucun : une course, un entretien à l'atelier."
          action={addButton}
        />
      ) : (
        <div className="space-y-6">
          <BulkActionBar selection={selection} actions={bulkActions} />
          {groups.map((group) => (
            <section key={group.state} aria-label={taskStatusLabels[group.state]}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Badge variant={taskStatusBadgeVariant[group.state]}>{taskStatusLabels[group.state]}</Badge>
                <span className="tabular-nums text-muted-foreground">{group.rows.length}</span>
              </h3>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SelectAllHead selection={selection} />
                      <TableHead>Tâche</TableHead>
                      <TableHead>Projet</TableHead>
                      <TableHead>Assignée à</TableHead>
                      <TableHead>Échéance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((task) => (
                      <TableRow key={task.id}>
                        <SelectRowCell selection={selection} row={task} label={`la tâche ${task.title}`} />
                        <TableCell>
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => setEditing(asProjectTask(task))}
                              className="text-left font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              {task.title}
                            </button>
                          ) : task.projectId ? (
                            <Link
                              href={`/projets/${task.projectId}/taches/${task.id}`}
                              className="font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              {task.title}
                            </Link>
                          ) : (
                            <p className="font-medium text-foreground">{task.title}</p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {task.taskTypeName && <Badge variant="secondary">{task.taskTypeName}</Badge>}
                            {/* Only when it is not the middle. Normale on every row would be a
                                column of the word "normal". */}
                            {task.priority !== "Normale" && (
                              <Badge variant="outline">{taskPriorityLabels[task.priority]}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {task.projectId && task.projectNumber != null ? (
                            <Link href={`/projets/${task.projectId}`} className="underline-offset-4 hover:underline">
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                {formatProjectNumber(task.projectNumber)}
                              </span>{" "}
                              {task.clientName}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Sans projet</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      <TaskFormSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        task={editing === "new" || editing === null ? undefined : editing}
      />
    </div>
  );
}
