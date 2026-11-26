"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { TaskFormSheet } from "@/components/projects/detail/task-form-sheet";
import { TaskTotalsTable } from "@/components/projects/detail/task-totals-table";
import { useCanManage } from "@/hooks/use-can-create";
import {
  useChangeTaskStatus,
  useDeleteProjectTask,
  useProjectTasksQuery,
} from "@/hooks/use-project-tasks";
import { ApiError } from "@/lib/api";
import { matchesSearch } from "@/lib/text-match";
import { SearchInput } from "@/components/layout/search-input";
import { formatDateOnly } from "@/lib/dates";
import { taskPriorityLabels, taskStatusBadgeVariant, taskStatusLabels } from "@/lib/labels";
import type { ProjectTask, ProjectTaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rowOpenClassName, rowOpenProps } from "@/components/layout/row-open";

const statuses: ProjectTaskStatus[] = ["AFaire", "EnCours", "Bloquee", "Terminee"];

/** Who it is on, in one line: the names, the crew, or the fact that it is on nobody. */
function assignedTo(task: ProjectTask): string {
  const names = task.assignees.map((a) => a.name);
  if (task.assignedTeamName) names.unshift(`Équipe ${task.assignedTeamName}`);
  return names.length > 0 ? names.join(", ") : "Non assignée";
}

/**
 * The tasks on one project.
 *
 * Cards rather than a table: a task carries a title, a crew, two dates and a status, and that
 * does not fit a row at phone width — which is where a task is actually ticked off.
 *
 * The checkbox is the whole point of the screen and everyone gets it, employees included: it
 * sends only the status, which is the one change the API lets an employee make. The rest —
 * writing a task, handing it to somebody, deleting it — stays with whoever runs the job.
 *
 * Not locked when the project is billed. The invoice says what the client owes; it does not say
 * the punch list is finished.
 */
export function ProjectTasksSection({ projectId }: { projectId: string }) {
  // A press on a task opens its own page — its details and everything filed against it.
  const router = useRouter();
  const canManage = useCanManage();
  const {
    data,
    isLoading,
    isError,
    isPlaceholderData,
    error: loadError,
    refetch,
  } = useProjectTasksQuery(projectId);

  const changeStatus = useChangeTaskStatus(projectId);
  const remove = useDeleteProjectTask(projectId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectTask | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ProjectTask | undefined>(undefined);

  const [search, setSearch] = useState("");
  const allTasks = data ?? [];
  const tasks = allTasks.filter((task) =>
    matchesSearch(search, task.title, task.description, ...task.assignees.map((a) => a.name)),
  );
  const open = tasks.filter((t) => t.status !== "Terminee").length;
  const late = tasks.filter((t) => t.isLate).length;

  function openCreate() {
    if (!canManage) return;
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(task: ProjectTask) {
    if (!canManage) return;
    setEditing(task);
    setFormOpen(true);
  }

  async function setStatus(task: ProjectTask, status: ProjectTaskStatus) {
    if (status === task.status) return;
    try {
      await changeStatus.mutateAsync({ id: task.id, status });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de changer l'état de cette tâche.",
      );
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Tâche supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de supprimer cette tâche.",
      );
    }
  }

  const createButton = canManage ? (
    <Button onClick={openCreate}>
      <Plus />
      Ajouter une tâche
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Tâches</h2>
          <p className="text-sm text-muted-foreground">
            Ce qu&apos;il reste à faire sur ce chantier, et qui s&apos;en occupe.
          </p>
        </div>
        {createButton}
      </div>

      {allTasks.length > 0 && (
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une tâche…" />
        </div>
      )}

      {late > 0 && (
        <p
          className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          <TriangleAlert className="size-4 shrink-0" />
          {late === 1 ? "Une tâche a dépassé son échéance." : `${late} tâches ont dépassé leur échéance.`}
        </p>
      )}

      {/* Only for those who may read a margin, which is the same list the endpoint enforces.
          An employee ticking off their day has no business seeing what the job makes. */}
      {canManage && tasks.length > 0 && (
        <div className="mb-4">
          <TaskTotalsTable projectId={projectId} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        <LoadErrorState
          error={loadError}
          title="Tâches indisponibles"
          fallback="Les tâches de ce projet n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Aucune tâche"
          description="Découpez le chantier en étapes, donnez-les à une équipe ou à des employés, et cochez-les au fur et à mesure."
          action={createButton}
        />
      ) : (
        <>
          <div className="space-y-2">
            {tasks.map((task) => {
              const done = task.status === "Terminee";

              return (
                <div
                  key={task.id}
                  {...rowOpenProps(
                    () => router.push(`/projets/${projectId}/taches/${task.id}`),
                    `Ouvrir la tâche ${task.title}`,
                  )}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border bg-card p-3",
                    rowOpenClassName,
                    // Finished work stays on the list — it is the record of what was done —
                    // but it stops competing for attention with what is still open.
                    done && "opacity-60",
                    task.isLate && "border-destructive/40",
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={done}
                    aria-label={done ? `Rouvrir ${task.title}` : `Terminer ${task.title}`}
                    onCheckedChange={(next) =>
                      setStatus(task, next === true ? "Terminee" : "AFaire")
                    }
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "font-medium text-foreground",
                          done && "line-through decoration-muted-foreground",
                        )}
                      >
                        {task.title}
                      </span>
                      <Badge variant={taskStatusBadgeVariant[task.status]}>
                        {taskStatusLabels[task.status]}
                      </Badge>
                      {/* Normale is the default, so saying it on every card would be noise. */}
                      {task.priority !== "Normale" && (
                        <Badge variant="outline">{taskPriorityLabels[task.priority]}</Badge>
                      )}
                      {task.isLate && <Badge variant="destructive">En retard</Badge>}
                    </div>

                    {task.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {task.description}
                      </p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <UsersRound className="size-3.5 shrink-0" />
                        {assignedTo(task)}
                      </span>
                      {task.dueDate && (
                        <span className="tabular-nums">
                          Échéance {formatDateOnly(task.dueDate)}
                        </span>
                      )}
                      {task.estimatedHours != null && (
                        <span className="tabular-nums">{task.estimatedHours} h estimées</span>
                      )}
                      {done && task.completedAt && (
                        <span className="flex items-center gap-1.5">
                          <CircleCheck className="size-3.5 shrink-0" />
                          Terminée
                        </span>
                      )}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" aria-label={`Actions sur ${task.title}`} />}
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/* The four states, not just done or not: an employee has to be able to
                          say a task is blocked, which is the state a checkbox cannot express. */}
                      <DropdownMenuRadioGroup
                        value={task.status}
                        onValueChange={(value) => setStatus(task, value as ProjectTaskStatus)}
                      >
                        {statuses.map((status) => (
                          <DropdownMenuRadioItem key={status} value={status}>
                            {taskStatusLabels[status]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>

                      {canManage && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEdit(task)}>
                            <Pencil />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(task)}
                          >
                            <Trash2 />
                            Supprimer
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            {open === 0
              ? `${tasks.length} tâche(s), toutes terminées.`
              : `${open} tâche(s) à faire sur ${tasks.length}.`}
          </p>
        </>
      )}

      <TaskFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        projectId={projectId}
        task={editing}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title="Supprimer cette tâche ?"
        description={
          deleteTarget
            ? `« ${deleteTarget.title} » sera retirée du projet. Cette action est définitive.`
            : ""
        }
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
