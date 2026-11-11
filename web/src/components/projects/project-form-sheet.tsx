"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { ClientSelect } from "@/components/clients/client-select";
import { useCreateProject, useUpdateProject, type ProjectFormValues } from "@/hooks/use-projects";
import { projectStatusLabels } from "@/lib/labels";
import type { ProjectRecord, ProjectStatus } from "@/lib/types";

const statuses = Object.keys(projectStatusLabels) as ProjectStatus[];

const formSchema = z.object({
  clientId: z.string().min(1, "Le client est requis."),
  name: z.string().min(1, "Le nom est requis."),
  description: z.string().optional().or(z.literal("")),
  status: z.custom<ProjectStatus>((v) => typeof v === "string" && statuses.includes(v as ProjectStatus)),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  budget: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(project?: ProjectRecord, defaultClientId?: string): FormValues {
  return {
    clientId: project?.clientId ?? defaultClientId ?? "",
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "Planifie",
    startDate: project?.startDate ?? "",
    endDate: project?.endDate ?? "",
    budget: project?.budget != null ? String(project.budget) : "",
  };
}

export function ProjectFormSheet({
  open,
  onOpenChange,
  project,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectRecord;
  defaultClientId?: string;
}) {
  const isEditing = Boolean(project);
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(project, defaultClientId),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(project, defaultClientId));
  }, [open, project, defaultClientId, form]);

  async function onSubmit(values: FormValues) {
    const payload: ProjectFormValues = {
      clientId: values.clientId,
      name: values.name.trim(),
      description: values.description || undefined,
      status: values.status,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      budget: values.budget ? Number(values.budget) : null,
    };

    try {
      if (isEditing && project) {
        await updateProject.mutateAsync({ id: project.id, values: payload });
        toast.success("Projet mis à jour.");
      } else {
        await createProject.mutateAsync(payload);
        toast.success("Projet créé.");
      }
      onOpenChange(false);
    } catch {
      toast.error("Impossible d'enregistrer le projet.");
    }
  }

  const pending = createProject.isPending || updateProject.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le projet" : "Nouveau projet"}</SheetTitle>
          <SheetDescription>Suivez l&apos;avancement d&apos;un mandat pour un client.</SheetDescription>
        </SheetHeader>

        <form
          id="project-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="clientId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-client">Client</FieldLabel>
                  <ClientSelect id="project-client" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-name">Nom du projet</FieldLabel>
                  <Input {...field} id="project-name" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-description">Description</FieldLabel>
                  <Textarea {...field} id="project-description" rows={3} />
                </Field>
              )}
            />

            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-status">Statut</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="project-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {projectStatusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="startDate"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="project-start">Début</FieldLabel>
                    <Input {...field} id="project-start" type="date" />
                  </Field>
                )}
              />
              <Controller
                name="endDate"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="project-end">Fin</FieldLabel>
                    <Input {...field} id="project-end" type="date" />
                  </Field>
                )}
              />
            </div>

            <Controller
              name="budget"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="project-budget">Budget ($)</FieldLabel>
                  <Input {...field} id="project-budget" type="number" step="0.01" min="0" />
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="project-form" disabled={pending}>
            {pending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le projet"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
