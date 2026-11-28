"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import {
  useCreateProjectTask,
  useTaskAssignablesQuery,
  useUpdateProjectTask,
} from "@/hooks/use-project-tasks";
import { useProjectSettingsQuery } from "@/hooks/use-project-settings";
import { useSaveWorkTask } from "@/hooks/use-work";
import { ProjectPicker } from "@/components/invoices/project-picker";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { dayIso, todayIso } from "@/lib/dates";
import { taskPriorityLabels, taskStatusLabels } from "@/lib/labels";
import type {
  ProjectTask,
  ProjectTaskPriority,
  ProjectTaskStatus,
  SaveProjectTaskValues,
  TaskAssignables,
} from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z
  .object({
    title: z.string().min(1, "Le titre est obligatoire.").max(200, "200 caractères maximum."),
    description: z.string().max(2000, "2000 caractères maximum.").optional().or(z.literal("")),
    status: z.enum(["AFaire", "EnCours", "Bloquee", "Terminee"]),
    priority: z.enum(["Basse", "Normale", "Haute", "Urgente"]),
    startDate: z.string().optional().or(z.literal("")),
    dueDate: z.string().optional().or(z.literal("")),
    estimatedHours: z.string().optional().or(z.literal("")),
    assignedTeamId: z.string().optional().or(z.literal("")),
    assigneeIds: z.array(z.string()),
    taskTypeId: z.string(),
    projectId: z.string(),
  })
  .refine((values) => !values.startDate || !values.dueDate || values.dueDate >= values.startDate, {
    message: "L'échéance ne peut pas précéder le début.",
    path: ["dueDate"],
  });

type FormValues = z.infer<typeof formSchema>;

/** A week, the same default the project form uses. */
const DEFAULT_DURATION_IN_DAYS = 7;

/** The value a Select uses for "aucune", because an empty string is not a selectable item. */
const NO_TEAM = "aucune";
const NO_TYPE = "aucun";

const statuses: ProjectTaskStatus[] = ["AFaire", "EnCours", "Bloquee", "Terminee"];
const priorities: ProjectTaskPriority[] = ["Basse", "Normale", "Haute", "Urgente"];

function toFormValues(task?: ProjectTask, projectId?: string): FormValues {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "AFaire",
    priority: task?.priority ?? "Normale",
    // A new task starts today and is due in a week. An existing one keeps what it was given,
    // blank included: filling an empty date on an edit would schedule work nobody scheduled.
    startDate: task ? (task.startDate ?? "") : todayIso(),
    dueDate: task ? (task.dueDate ?? "") : dayIso(DEFAULT_DURATION_IN_DAYS),
    estimatedHours: task?.estimatedHours != null ? String(task.estimatedHours) : "",
    assignedTeamId: task?.assignedTeamId ?? "",
    assigneeIds: task?.assignees.map((a) => a.id) ?? [],
    taskTypeId: task?.taskTypeId ?? "",
    projectId: task?.projectId ?? projectId ?? "",
  };
}

/**
 * One task, in a panel.
 *
 * A panel rather than cells edited in place: a task has nine fields and one of them is a list
 * of people, which no table row holds legibly. The list itself stays a list one can tick off
 * without ever opening this.
 */
export function TaskFormSheet({
  open,
  onOpenChange,
  projectId,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitted from Tâches et horaire: the task may then be on any project, or on none. */
  projectId?: string;
  task?: ProjectTask;
}) {
  const isEditing = Boolean(task);
  const onProject = Boolean(projectId);
  const create = useCreateProjectTask(projectId ?? "");
  const update = useUpdateProjectTask(projectId ?? "");
  const saveAnywhere = useSaveWorkTask();

  // Only while the panel is open: two lists nobody needs in order to read the tasks.
  const { data: projectAssignables } = useTaskAssignablesQuery(projectId, open && onProject);
  const { data: anyAssignables } = useQuery({
    queryKey: ["taches", "assignables"],
    queryFn: () => api.get<TaskAssignables>("taches/assignables"),
    enabled: open && !onProject,
    staleTime: 5 * 60 * 1000,
  });
  const assignables = onProject ? projectAssignables : anyAssignables;
  const { data: projectSettings } = useProjectSettingsQuery(open);
  const taskTypes = projectSettings?.taskTypes ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(task, projectId),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(task, projectId));
  }, [open, task, projectId, form]);

  const pending = create.isPending || update.isPending || saveAnywhere.isPending;

  async function onSubmit(values: FormValues) {
    const payload: SaveProjectTaskValues = {
      title: values.title.trim(),
      description: values.description?.trim() || null,
      status: values.status,
      priority: values.priority,
      startDate: values.startDate || null,
      dueDate: values.dueDate || null,
      estimatedHours: values.estimatedHours ? Number(values.estimatedHours) : null,
      assignedTeamId: values.assignedTeamId || null,
      assigneeIds: values.assigneeIds,
      taskTypeId: values.taskTypeId || null,
      projectId: values.projectId || null,
    };

    try {
      if (!onProject) {
        await saveAnywhere.mutateAsync({ id: task?.id, values: payload });
        toast.success(task ? "Tâche enregistrée." : "Tâche ajoutée.");
      } else if (task) {
        await update.mutateAsync({ id: task.id, values: payload });
        toast.success("Tâche enregistrée.");
      } else {
        await create.mutateAsync(payload);
        toast.success("Tâche ajoutée.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible d'enregistrer cette tâche.",
      );
    }
  }

  const employees = assignables?.employees ?? [];
  const teams = assignables?.teams ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier la tâche" : "Nouvelle tâche"}</SheetTitle>
          <SheetDescription>
            Une tâche peut aller à une équipe, à des personnes nommées, aux deux, ou à personne.
          </SheetDescription>
        </SheetHeader>

        <form
          id="task-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="task-title">
                    Titre
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="task-title"
                    placeholder={ex("Poser les solives")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {/* From Tâches et horaire: a project, or none for an errand or a shop chore. Once a
                task is on a job it stays there — its hours were filed against that job. */}
            {!onProject && (
              <Controller
                name="projectId"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="task-project">Projet</FieldLabel>
                    {task?.projectId ? (
                      <p className="text-sm text-muted-foreground">Cette tâche reste sur son projet.</p>
                    ) : (
                      <>
                        <ProjectPicker id="task-project" value={field.value} onChange={field.onChange} />
                        <FieldDescription>Facultatif : une tâche peut n&apos;appartenir à aucun projet.</FieldDescription>
                      </>
                    )}
                  </Field>
                )}
              />
            )}

            <Controller
              name="taskTypeId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="task-type">Type de tâche</FieldLabel>
                  <Select
                    value={field.value || NO_TYPE}
                    onValueChange={(value) => field.onChange(value === NO_TYPE || !value ? "" : value)}
                  >
                    <SelectTrigger id="task-type" className="w-full">
                      <SelectValue>
                        {(value: string) =>
                          !value || value === NO_TYPE ? "Aucun" : (taskTypes.find((t) => t.id === value)?.name ?? "Aucun")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TYPE}>Aucun</SelectItem>
                      {taskTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>Les types se gèrent dans Paramètres › Projets, avec les lignes automatiques.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="task-description">Description</FieldLabel>
                  <Textarea {...field} id="task-description" rows={3} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="status"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="task-status">Statut</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="task-status" className="w-full">
                        {/* The field holds the stored name — "EnCours" — until the list has
                            been opened once, so the closed select is formatted here. */}
                        <SelectValue>{(s: ProjectTaskStatus) => taskStatusLabels[s]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {taskStatusLabels[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />

              <Controller
                name="priority"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="task-priority">Priorité</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="task-priority" className="w-full">
                        <SelectValue>
                          {(p: ProjectTaskPriority) => taskPriorityLabels[p]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {priorities.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {taskPriorityLabels[priority]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="startDate"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="task-start">Début</FieldLabel>
                    <Input {...field} id="task-start" type="date" />
                  </Field>
                )}
              />
              <Controller
                name="dueDate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="task-due">Échéance</FieldLabel>
                    <Input {...field} id="task-due" type="date" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="estimatedHours"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="task-hours">Heures estimées</FieldLabel>
                  <Input {...field} id="task-hours" type="number" step="0.25" min="0" />
                  <FieldDescription>
                    À comparer aux heures réellement inscrites sur le projet.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="assignedTeamId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="task-team">Équipe</FieldLabel>
                  <Select
                    value={field.value || NO_TEAM}
                    onValueChange={(value) => field.onChange(value === NO_TEAM ? "" : value)}
                  >
                    <SelectTrigger id="task-team" className="w-full">
                      <SelectValue>
                        {(value: string) =>
                          value === NO_TEAM || !value
                            ? "Aucune"
                            : (teams.find((t) => t.id === value)?.name ?? "Aucune")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEAM}>Aucune</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name} ({team.memberCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Donner la tâche à une équipe entière la garde assignée même si le personnel
                    change.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="assigneeIds"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel>Employés assignés</FieldLabel>
                  {employees.length === 0 ? (
                    <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      <UsersRound className="size-4 shrink-0" />
                      Aucun employé au dossier pour l&apos;instant.
                    </p>
                  ) : (
                    /* A scrolling list of checkboxes rather than a multi-select: a crew of
                       twenty is still readable this way, and who is ticked is visible without
                       opening anything. */
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                      {employees.map((employee) => {
                        const checked = field.value.includes(employee.id);
                        return (
                          <div
                            key={employee.id}
                            className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                          >
                            <Checkbox
                              id={`task-assignee-${employee.id}`}
                              checked={checked}
                              onCheckedChange={(next) =>
                                field.onChange(
                                  next === true
                                    ? [...field.value, employee.id]
                                    : field.value.filter((id) => id !== employee.id),
                                )
                              }
                            />
                            <FieldLabel
                              htmlFor={`task-assignee-${employee.id}`}
                              className="min-w-0 flex-1 font-normal"
                            >
                              <span className="block truncate">{employee.name}</span>
                              {employee.jobTitle && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {employee.jobTitle}
                                </span>
                              )}
                            </FieldLabel>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="task-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter la tâche"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
