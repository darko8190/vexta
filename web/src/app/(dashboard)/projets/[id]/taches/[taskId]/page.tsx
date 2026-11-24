"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, HardHat, Info, ListChecks, Plus, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { InlineSheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { SectionNav, type NavSection } from "@/components/layout/section-nav";
import { ProjectExpensesSection } from "@/components/projects/detail/project-expenses-section";
import { ProjectExtraChargesSection } from "@/components/projects/detail/project-extra-charges-section";
import { ProjectMaterialsSection } from "@/components/projects/detail/project-materials-section";
import { ProjectTimesheetsSection } from "@/components/projects/detail/project-timesheets-section";
import { TaskFormSheet } from "@/components/projects/detail/task-form-sheet";
import { useCanManage } from "@/hooks/use-can-create";
import { useExpensesQuery } from "@/hooks/use-expenses";
import { useExtraChargesQuery } from "@/hooks/use-extra-charges";
import { useProjectMaterialsQuery } from "@/hooks/use-project-materials";
import { useProjectTasksQuery } from "@/hooks/use-project-tasks";
import { useProjectQuery } from "@/hooks/use-projects";
import { useTimesheetsQuery } from "@/hooks/use-timesheets";
import { formatDateOnly } from "@/lib/dates";
import { taskPriorityLabels, taskStatusBadgeVariant, taskStatusLabels } from "@/lib/labels";
import { formatProjectNumber } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One task's own page: its details, editable in place, then what has been filed against it —
 * the materials, the extra charges, the hours and the expenses. The same sections as the
 * project's, narrowed to this task, and a row added here is filed against it.
 */
export default function ProjectTaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id: projectId, taskId } = use(params);
  const { data: project } = useProjectQuery(projectId);
  const { data: tasks, isLoading, isError } = useProjectTasksQuery(projectId);
  const canManage = useCanManage();
  const [section, setSection] = useState("details");

  // The project's own lists, shared with its tabs through the cache; counted here for the rail.
  const { data: materials } = useProjectMaterialsQuery(projectId);
  const { data: charges } = useExtraChargesQuery(projectId);
  const { data: timesheets } = useTimesheetsQuery(projectId);
  const { data: expenses } = useExpensesQuery(projectId);

  const task = tasks?.find((item) => item.id === taskId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !task) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Tâche introuvable"
        description="Cette tâche n'existe plus, ou vous n'y avez pas accès."
        action={
          <Link href={`/projets/${projectId}`} className={cn(buttonVariants())}>
            Retour au projet
          </Link>
        }
      />
    );
  }

  // Billed means the figures behind the job stop moving — the same lock as on the project.
  const locked = project?.status === "Facture";
  const count = (rows: { projectTaskId: string | null }[] | undefined) =>
    (rows ?? []).filter((row) => row.projectTaskId === taskId).length;

  const sections: NavSection[] = [
    { key: "details", label: "Détails", icon: Info },
    { key: "materiaux", label: "Matériaux", count: count(materials), icon: HardHat },
    { key: "frais", label: "Frais supplémentaires", count: count(charges), icon: Plus },
    { key: "feuilles-de-temps", label: "Feuilles de temps", count: count(timesheets), icon: Clock },
    { key: "depenses", label: "Dépenses", count: count(expenses), icon: Receipt },
  ];

  return (
    <div>
      <Link
        href={`/projets/${projectId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {project ? `Projet ${formatProjectNumber(project.number)} — ${project.clientName}` : "Projet"}
      </Link>

      <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={taskStatusBadgeVariant[task.status]}>{taskStatusLabels[task.status]}</Badge>
          <Badge variant="outline">{taskPriorityLabels[task.priority]}</Badge>
          {task.isLate && <Badge variant="destructive">En retard</Badge>}
          {task.dueDate && (
            <span className="text-xs text-muted-foreground">Échéance {formatDateOnly(task.dueDate)}</span>
          )}
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{task.title}</h1>
        {(task.assignedTeamName || task.assignees.length > 0) && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[task.assignedTeamName, ...task.assignees.map((person) => person.name)].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SectionNav sections={sections} active={section} onSelect={setSection} label="Sections de la tâche" />

        <div className="min-w-0 flex-1">
          {section === "details" &&
            (canManage ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Détails</h2>
                  <p className="text-sm text-muted-foreground">Modifiez les champs directement, puis enregistrez.</p>
                </div>
                <InlineSheet>
                  <TaskFormSheet open onOpenChange={() => {}} projectId={projectId} task={task} />
                </InlineSheet>
              </div>
            ) : (
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-foreground">Détails</h2>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {task.description || "Aucune description."}
                </p>
              </div>
            ))}
          {section === "materiaux" && (
            <ProjectMaterialsSection projectId={projectId} locked={locked} taskId={taskId} />
          )}
          {section === "frais" && (
            <ProjectExtraChargesSection projectId={projectId} locked={locked} taskId={taskId} />
          )}
          {section === "feuilles-de-temps" && (
            <ProjectTimesheetsSection projectId={projectId} locked={locked} taskId={taskId} />
          )}
          {section === "depenses" && (
            <ProjectExpensesSection projectId={projectId} locked={locked} taskId={taskId} />
          )}
        </div>
      </div>
    </div>
  );
}
