"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { BriefcaseBusiness, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { EmptyState } from "@/components/layout/empty-state";
import { useDeleteJobPosting, useJobPostingsQuery, useSaveJobPosting } from "@/hooks/use-public-page";
import { ApiError } from "@/lib/api";
import { employmentTypeLabels } from "@/lib/labels";
import type { EmploymentType, JobPosting } from "@/lib/types";

const employmentTypes: EmploymentType[] = ["TempsPlein", "TempsPartiel", "Contrat", "Saisonnier", "Stage"];

const formSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis.").max(200, "200 caractères maximum."),
  description: z.string().trim().max(4000, "4000 caractères maximum."),
  location: z.string().trim().max(200, "200 caractères maximum."),
  employmentType: z.enum(["TempsPlein", "TempsPartiel", "Contrat", "Saisonnier", "Stage"]),
  compensation: z.string().trim().max(200, "200 caractères maximum."),
  applyTo: z.string().trim().max(300, "300 caractères maximum."),
  isPublished: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(job?: JobPosting): FormValues {
  return {
    title: job?.title ?? "",
    description: job?.description ?? "",
    location: job?.location ?? "",
    // Temps plein and published: what a company posting a position almost always means, so the
    // sheet opens on an answer rather than on two more decisions.
    employmentType: job?.employmentType ?? "TempsPlein",
    compensation: job?.compensation ?? "",
    applyTo: job?.applyTo ?? "",
    isPublished: job?.isPublished ?? true,
  };
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {" *"}
    </span>
  );
}

function JobFormSheet({
  open,
  onOpenChange,
  job,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: JobPosting;
}) {
  const isEditing = Boolean(job);
  const save = useSaveJobPosting();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(job),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(job));
  }, [open, job, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: job?.id,
        values: {
          title: values.title,
          description: values.description || null,
          location: values.location || null,
          employmentType: values.employmentType,
          compensation: values.compensation || null,
          applyTo: values.applyTo || null,
          isPublished: values.isPublished,
        },
      });
      toast.success(isEditing ? "Offre mise à jour." : "Offre ajoutée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer cette offre.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier l'offre" : "Nouvelle offre d'emploi"}</SheetTitle>
          <SheetDescription>
            Un poste à combler, tel qu&apos;il apparaîtra sur votre page publique.
          </SheetDescription>
        </SheetHeader>

        <form
          id="job-form"
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
                  <FieldLabel htmlFor="job-title">
                    Titre
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="job-title"
                    placeholder="Charpentier-menuisier"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="job-description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    id="job-description"
                    rows={5}
                    placeholder="Les tâches, l'expérience demandée, ce que vous offrez."
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="location"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="job-location">Lieu</FieldLabel>
                    <Input
                      {...field}
                      id="job-location"
                      placeholder="Québec et environs"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                name="employmentType"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="job-type">Type d&apos;emploi</FieldLabel>
                    <Select value={field.value || null} onValueChange={field.onChange}>
                      <SelectTrigger id="job-type" className="w-full">
                        <SelectValue>
                          {(type: EmploymentType | null) =>
                            type ? employmentTypeLabels[type] : "Choisir un type"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {employmentTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {employmentTypeLabels[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </div>

            <Controller
              name="compensation"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="job-compensation">Rémunération</FieldLabel>
                  <Input
                    {...field}
                    id="job-compensation"
                    placeholder="28 à 34 $/h"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Dites-le comme vous le diriez de vive voix.</FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="applyTo"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="job-apply">Comment postuler</FieldLabel>
                  <Input
                    {...field}
                    id="job-apply"
                    placeholder="emplois@entreprise.ca ou 418 555-0100"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="isPublished"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="job-published"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="job-published">Publiée sur la page</FieldLabel>
                </Field>
              )}
            />
            <FieldDescription>
              Décochez pour garder l&apos;offre en réserve : un poste comblé reste au dossier et
              quitte la page.
            </FieldDescription>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="job-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter l'offre"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** The company's positions: the table is the file, the ticked ones are the page. */
export function JobPostingsCard() {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } = useJobPostingsQuery();
  const remove = useDeleteJobPosting();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JobPosting | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<JobPosting | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Offre supprimée.");
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer cette offre.");
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <Plus />
      Nouvelle offre
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BriefcaseBusiness className="size-4" />
            Offres d&apos;emploi
          </CardTitle>
          <CardDescription>Les postes à combler, publiés ou gardés en réserve.</CardDescription>
        </div>
        {createButton}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError && (!data || isPlaceholderData) ? (
          /* An error is not an empty list. "Aucune offre" after a failed request tells someone
             their postings are gone, when they were simply not read.
             And `isError` alone is too wide: a failed background refetch keeps it true over rows
             that are still right, so the panel only wins with nothing read at all (`!data`) or rows
             left over from another query key (`isPlaceholderData`). */
          <LoadErrorState
            error={loadError}
            title="Offres indisponibles"
            fallback="Vos offres d'emploi n'ont pas pu être chargées."
            onRetry={() => refetch()}
          />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={BriefcaseBusiness}
            title="Aucune offre"
            description="Ajoutez un poste à combler et il apparaîtra sur votre page publique."
            action={createButton}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Lieu</TableHead>
                <TableHead>Publiée</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium text-foreground">{job.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {employmentTypeLabels[job.employmentType]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{job.location ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={job.isPublished ? "default" : "secondary"}>
                      {job.isPublished ? "Publiée" : "En réserve"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" aria-label={`Actions pour ${job.title}`} />}
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(job);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(job)}>
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <JobFormSheet open={formOpen} onOpenChange={setFormOpen} job={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette offre ?"
        description={`« ${deleteTarget?.title} » sera retirée de votre page publique et supprimée.`}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </Card>
  );
}
