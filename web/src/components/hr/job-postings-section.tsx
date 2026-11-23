"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { BriefcaseBusiness, MoreHorizontal, Pencil, Plus, Trash2, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import {
  useDeleteJobPosting,
  useJobPostingsQuery,
  useSaveJobPosting,
} from "@/hooks/use-job-postings";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import {
  employmentTypeLabels,
  jobPostingStatusBadgeVariant,
  jobPostingStatusLabels,
} from "@/lib/labels";
import type { EmploymentType, JobPosting, JobPostingStatus } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const employmentTypes: EmploymentType[] = ["TempsPlein", "TempsPartiel", "Contrat", "Saisonnier", "Stage"];
const statuses: JobPostingStatus[] = ["Brouillon", "Publiee", "Pourvue", "Fermee"];

const formSchema = z
  .object({
    title: z.string().trim().min(1, "Le titre est requis.").max(200, "200 caractères maximum."),
    description: z.string().trim().max(4000, "4000 caractères maximum."),
    location: z.string().trim().max(200, "200 caractères maximum."),
    employmentType: z.enum(["TempsPlein", "TempsPartiel", "Contrat", "Saisonnier", "Stage"]),
    compensation: z.string().trim().max(200, "200 caractères maximum."),
    applyTo: z.string().trim().max(300, "300 caractères maximum."),
    notes: z.string().trim().max(4000, "4000 caractères maximum."),
    // A string, like every other number in this codebase's forms. A coerced number would make
    // the schema's input and output types differ, which the resolver refuses.
    openings: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Entrez un nombre entre 1 et 100.")
      .refine((value) => Number(value) >= 1, "Au moins un poste.")
      .refine((value) => Number(value) <= 100, "Cent postes, c'est déjà toute une équipe."),
    status: z.enum(["Brouillon", "Publiee", "Pourvue", "Fermee"]),
    postedOn: z.string(),
    closesOn: z.string(),
  })
  .refine((values) => !values.postedOn || !values.closesOn || values.closesOn >= values.postedOn, {
    message: "La fermeture ne peut pas précéder l'affichage.",
    path: ["closesOn"],
  });

type FormValues = z.infer<typeof formSchema>;

function toFormValues(job?: JobPosting): FormValues {
  return {
    title: job?.title ?? "",
    description: job?.description ?? "",
    location: job?.location ?? "",
    // Temps plein, published, one position: what a company posting a job almost always means,
    // so the sheet opens on an answer rather than on four more decisions.
    employmentType: job?.employmentType ?? "TempsPlein",
    compensation: job?.compensation ?? "",
    applyTo: job?.applyTo ?? "",
    notes: job?.notes ?? "",
    openings: String(job?.openings ?? 1),
    status: job?.status ?? "Publiee",
    postedOn: job?.postedOn ?? "",
    closesOn: job?.closesOn ?? "",
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
          notes: values.notes || null,
          openings: Number(values.openings),
          status: values.status,
          postedOn: values.postedOn || null,
          closesOn: values.closesOn || null,
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
            Un poste à combler. Publiée, elle apparaît aussi sur votre page publique.
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
                    placeholder={ex("Charpentier-menuisier")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="status"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="job-status">État</FieldLabel>
                    <Select value={field.value || null} onValueChange={field.onChange}>
                      <SelectTrigger id="job-status" className="w-full">
                        <SelectValue>
                          {(status: JobPostingStatus | null) =>
                            status ? jobPostingStatusLabels[status] : "Choisir un état"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {jobPostingStatusLabels[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Seule une offre publiée paraît sur la page publique.
                    </FieldDescription>
                  </Field>
                )}
              />

              <Controller
                name="openings"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="job-openings">Postes à combler</FieldLabel>
                    <Input
                      {...field}
                      id="job-openings"
                      inputMode="numeric"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

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
                    placeholder={ex("Les tâches, l'expérience demandée, ce que vous offrez.")}
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
                      placeholder={ex("Québec et environs")}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="postedOn"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="job-posted">Affichée le</FieldLabel>
                    <Input {...field} id="job-posted" type="date" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>Laissez vide : la date du jour sera inscrite.</FieldDescription>
                    )}
                  </Field>
                )}
              />

              <Controller
                name="closesOn"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="job-closes">Fermeture</FieldLabel>
                    <Input {...field} id="job-closes" type="date" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>Vide : ouverte jusqu&apos;à ce qu&apos;elle soit comblée.</FieldDescription>
                    )}
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
                    placeholder={ex("28 à 34 $/h")}
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
                    placeholder={ex("emplois@entreprise.ca ou 418 555-0100")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="notes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="job-notes">Notes internes</FieldLabel>
                  <Textarea
                    {...field}
                    id="job-notes"
                    rows={3}
                    placeholder={ex("Budget approuvé par Marc. Remplace Luc, parti en mai.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Jamais affichées sur la page publique.</FieldDescription>
                  )}
                </Field>
              )}
            />
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

/**
 * The positions the company is hiring for.
 *
 * The table carries the hiring file and not only the advertisement: how many people are wanted,
 * when it went out, and how many have answered. The count of applications is what makes a
 * posting worth keeping after the season — a position that drew nobody is the one worth writing
 * differently next spring, and that is only visible if the number is here.
 *
 * `onShowCandidates` lets the applications badge open the Candidats section filtered to one
 * posting. Without it the number is a fact nobody can act on.
 */
export function JobPostingsSection({
  onShowCandidates,
}: {
  onShowCandidates?: (job: JobPosting) => void;
}) {
  const { data, isLoading, isError, isPlaceholderData, error: loadError, refetch } =
    useJobPostingsQuery();
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

  const items = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Offres d&apos;emplois</h2>
          <p className="text-sm text-muted-foreground">
            Les postes affichés, et combien de personnes ont répondu à chacun.
          </p>
        </div>
        {createButton}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError && (!data || isPlaceholderData) ? (
        /* An error is not an empty list. "Aucune offre" after a failed request tells somebody
           their postings are gone, when they were simply not read. */
        <LoadErrorState
          error={loadError}
          title="Offres indisponibles"
          fallback="Vos offres d'emploi n'ont pas pu être chargées."
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          title="Aucune offre d'emploi"
          description="Affichez un poste à combler. Publié, il paraît aussi sur votre page publique."
          action={createButton}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Poste</TableHead>
                <TableHead>État</TableHead>
                <TableHead className="text-right">Postes</TableHead>
                <TableHead className="text-right">Candidatures</TableHead>
                <TableHead>Affichée</TableHead>
                <TableHead>Fermeture</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {employmentTypeLabels[job.employmentType]}
                      {job.location && ` · ${job.location}`}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={jobPostingStatusBadgeVariant[job.status]}>
                      {jobPostingStatusLabels[job.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {job.openings}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {job.applications === 0 ? (
                      <span className="text-muted-foreground">0</span>
                    ) : onShowCandidates ? (
                      <Button
                        variant="link"
                        className="h-auto p-0 tabular-nums"
                        onClick={() => onShowCandidates(job)}
                      >
                        <UserSearch className="size-3.5" />
                        {job.applications}
                      </Button>
                    ) : (
                      job.applications
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.postedOn ? formatDateOnly(job.postedOn) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.closesOn ? formatDateOnly(job.closesOn) : "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" aria-label={`Actions pour ${job.title}`} />
                        }
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
        </div>
      )}

      <JobFormSheet open={formOpen} onOpenChange={setFormOpen} job={editing} />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="Supprimer cette offre ?"
        description={
          deleteTarget && deleteTarget.applications > 0
            ? `« ${deleteTarget.title} » sera supprimée. Les ${deleteTarget.applications} candidatures reçues restent au dossier.`
            : `« ${deleteTarget?.title} » sera retirée de votre page publique et supprimée.`
        }
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}
