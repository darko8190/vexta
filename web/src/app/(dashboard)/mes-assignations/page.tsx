"use client";

import Link from "next/link";
import { CircleCheck, ListChecks, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useChangeWorkTaskStatus } from "@/hooks/use-work";
import { ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { PageHeader } from "@/components/layout/page-header";
import { useMyAssignmentsQuery } from "@/hooks/use-my-work";
import { useMyDayQuery } from "@/hooks/use-work-days";
import { MyDayCard } from "@/components/work/my-day-card";
import { ChevronRight, Lock } from "lucide-react";
import { formatDateOnly } from "@/lib/dates";
import { taskPriorityLabels, taskStatusBadgeVariant, taskStatusLabels } from "@/lib/labels";
import { formatProjectNumber } from "@/lib/types";

/**
 * The tasks handed to me, whether by name or through a crew I am on.
 *
 * Cards rather than a table: a task carries a title, a job, a due date, a priority and
 * sometimes the crew it came through, and that does not fit a row at phone width — which is
 * where somebody is standing when they check what they are supposed to be doing today.
 *
 * A task is ended from here with « Terminer l'assignation » once at least one timesheet is in on
 * it — typed, or a punch started and ended. A task on no project keeps no hours and ends at once.
 */
export default function MyAssignmentsPage() {
  const { data, isLoading, isError, error, refetch } = useMyAssignmentsQuery();
  const assignments = data?.assignments ?? [];
  const { data: myDay } = useMyDayQuery();
  // The assignments open once the day is under way: the poinçons on each job go inside the day.
  const dayRunning = Boolean(myDay?.today && !myDay.today.endedAt);

  const finish = useChangeWorkTaskStatus();
  const open = assignments.filter((task) => task.status !== "Terminee");

  async function finishTask(id: string) {
    try {
      await finish.mutateAsync({ id, status: "Terminee" });
      toast.success("Assignation terminée.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de terminer cette assignation.");
    }
  }
  const late = open.filter((task) => task.isLate);

  return (
    <div>
      <PageHeader
        title="Mes assignations"
        description="Les tâches qui vous ont été confiées, par votre nom ou par votre équipe."
      />

      {myDay?.hasEmployee && <MyDayCard day={myDay} />}

      {!isLoading && !isError && assignments.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{open.length} à faire</Badge>
          {late.length > 0 && <Badge variant="destructive">{late.length} en retard</Badge>}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : isError ? (
        <LoadErrorState
          error={error}
          title="Assignations indisponibles"
          fallback="Vos tâches n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : data && !data.hasEmployeeRecord ? (
        <EmptyState
          icon={ListChecks}
          title="Aucun dossier d'employé"
          description="Votre compte n'est rattaché à aucun employé, donc aucune tâche ne peut vous être assignée. Un administrateur peut vous ajouter dans Ressources humaines."
        />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Rien de vous assigné"
          description="Les tâches s'assignent depuis l'onglet Tâches d'un projet, à des personnes ou à une équipe complète."
        />
      ) : (
        <div className="space-y-2">
          {assignments.map((task) => (
            <div
              key={task.id}
              className="relative rounded-lg border border-border bg-card p-3 opacity-100 transition-colors data-[done=true]:opacity-60 data-[open=true]:hover:bg-muted/40"
              data-done={task.status === "Terminee"}
              data-open={dayRunning}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {dayRunning && task.projectId ? (
                      // Stretched over the card: the whole card opens the task.
                      <Link
                        href={`/projets/${task.projectId}/taches/${task.id}`}
                        className="font-medium text-foreground after:absolute after:inset-0 focus-visible:outline-none"
                      >
                        {task.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{task.title}</span>
                    )}
                    <Badge variant={taskStatusBadgeVariant[task.status]}>
                      {taskStatusLabels[task.status]}
                    </Badge>
                    {/* Said only when it is not the middle, so the list is not a wall of
                        "Normale" with the one Urgente lost in it. */}
                    {task.priority !== "Normale" && (
                      <Badge variant="outline">{taskPriorityLabels[task.priority]}</Badge>
                    )}
                    {task.isLate && <Badge variant="destructive">En retard</Badge>}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {task.projectId && task.projectNumber != null ? (
                      <>
                        <Link
                          href={`/projets/${task.projectId}`}
                          className="relative z-10 font-medium underline-offset-4 hover:underline"
                        >
                          {formatProjectNumber(task.projectNumber)}
                        </Link>
                        <span className="truncate">{task.clientName}</span>
                      </>
                    ) : (
                      <span>Sans projet</span>
                    )}
                    {task.dueDate && (
                      <span className="tabular-nums">Pour le {formatDateOnly(task.dueDate)}</span>
                    )}
                    {/* "Ce n'est pas à moi, c'est à l'équipe" is the first thing anybody thinks
                        when they see a task they do not recognise. The answer belongs here. */}
                    {task.viaTeam && (
                      <span className="flex items-center gap-1.5">
                        <Users className="size-3.5 shrink-0" />
                        Équipe {task.viaTeam}
                      </span>
                    )}
                  </div>

                  {task.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                      {task.description}
                    </p>
                  )}

                  {/* Over the stretched link, so the button is its own target. */}
                  {task.status !== "Terminee" && (task.myEntries > 0 || !task.projectId) && (
                    <Button
                      size="sm"
                      className="relative z-10 mt-2"
                      disabled={finish.isPending}
                      onClick={() => void finishTask(task.id)}
                    >
                      {finish.isPending && finish.variables?.id === task.id ? <Spinner /> : <CircleCheck />}
                      Terminer l&apos;assignation
                    </Button>
                  )}
                </div>
                {dayRunning ? (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Commencez votre journée pour ouvrir" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
