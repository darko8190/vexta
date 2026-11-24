"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Layers, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
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
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { LoadErrorState } from "@/components/layout/load-error-state";
import { useCanManage } from "@/hooks/use-can-create";
import {
  useDeleteWageClassification,
  useSaveWageClassification,
  useWageClassificationsQuery,
} from "@/hooks/use-wage-classifications";
import { ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { ex } from "@/lib/placeholders";
import type { WageClassification } from "@/lib/types";

/** "32", "32,50" and "32.50" all, or nothing: a rate not worked out yet is left blank. */
const RATE = /^\d+([.,]\d{1,2})?$/;
const rate = z
  .string()
  .trim()
  .refine((value) => value === "" || RATE.test(value.replace(/\s/g, "")), "Un taux s'écrit comme 32 ou 32,50.");

const formSchema = z.object({
  name: z.string().trim().min(1, "Le classement a besoin d'un titre.").max(100, "100 caractères maximum."),
  steps: z.array(
    z.object({
      id: z.string(),
      name: z.string().trim().min(1, "Nom requis.").max(100, "100 caractères maximum."),
      wage: rate,
      cost: rate,
      selling: rate,
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

function rateField(value: number | null): string {
  if (value == null) return "";
  return value % 1 === 0 ? String(value) : value.toFixed(2).replace(".", ",");
}

function parseRate(value: string): number | null {
  const typed = value.replace(/\s/g, "").replace(",", ".");
  return typed === "" ? null : Number(typed);
}

function hourly(value: number | null): string {
  return value == null ? "—" : formatAmount(value);
}

/**
 * The company's pay classifications, under the default hourly rate.
 *
 * Each one is a title with its steps listed under it — the way the grid is printed on the
 * sector's own sheet — so a company reads its whole rate table on one screen without opening
 * anything. Editing a classification edits its whole table at once.
 */
export function WageClassificationsCard() {
  const canManage = useCanManage();
  const { data, isLoading, isError, error, refetch } = useWageClassificationsQuery();
  const remove = useDeleteWageClassification();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WageClassification | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<WageClassification | undefined>(undefined);

  const classifications = data ?? [];

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(classification: WageClassification) {
    setEditing(classification);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Classement supprimé.");
      setDeleteTarget(undefined);
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "Impossible de supprimer ce classement.");
    }
  }

  const createButton = canManage ? (
    <Button onClick={openCreate}>
      <Plus />
      Nouveau classement
    </Button>
  ) : undefined;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4" />
              Classements
            </CardTitle>
            <CardDescription className="mt-1">
              Un titre et ses échelons, chacun avec son salaire, son coûtant et son vendant. Le
              classement se choisit sur le projet.
            </CardDescription>
          </div>
          {classifications.length > 0 && createButton}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : isError && !data ? (
          <LoadErrorState
            error={error}
            title="Classements indisponibles"
            fallback="Vos classements n'ont pas pu être chargés."
            onRetry={() => void refetch()}
          />
        ) : classifications.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Aucun classement"
            description="Par exemple « Commercial », avec Apprenti 1 à 4 puis Compagnon, chacun à son taux."
            action={createButton}
          />
        ) : (
          <div className="space-y-6">
            {classifications.map((classification) => (
              <section key={classification.id} aria-label={classification.name}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{classification.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {classification.projectCount === 0
                        ? "Aucun projet"
                        : `${classification.projectCount} projet${classification.projectCount > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" aria-label={`Actions pour ${classification.name}`} />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(classification)}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(classification)}>
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {classification.steps.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    Aucun échelon. Modifiez le classement pour en ajouter.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Échelon</TableHead>
                          <TableHead className="w-28 text-right">Salaire</TableHead>
                          <TableHead className="w-28 text-right">Coûtant</TableHead>
                          <TableHead className="w-28 text-right">Vendant</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classification.steps.map((step) => (
                          <TableRow key={step.id}>
                            <TableCell className="font-medium">{step.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{hourly(step.wage)}</TableCell>
                            <TableCell className="text-right tabular-nums">{hourly(step.cost)}</TableCell>
                            <TableCell className="text-right tabular-nums">{hourly(step.selling)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            ))}
            <p className="text-xs text-muted-foreground">Tous les taux sont à l&apos;heure.</p>
          </div>
        )}
      </CardContent>

      {formOpen && (
        <ClassificationSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          classification={editing}
          nextSortOrder={classifications.length}
        />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
        title={`Supprimer le classement ${deleteTarget?.name ?? ""} ?`}
        description={
          deleteTarget && deleteTarget.projectCount > 0
            ? `Ses échelons partent avec lui. ${deleteTarget.projectCount} projet${deleteTarget.projectCount > 1 ? "s" : ""} n'auront plus de classement.`
            : "Ses échelons partent avec lui."
        }
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}

/** A new classification starts with the usual ladder, so most companies only fill in rates. */
const DEFAULT_STEPS = ["Apprenti 1", "Apprenti 2", "Apprenti 3", "Apprenti 4", "Compagnon"];

function toFormValues(classification?: WageClassification): FormValues {
  if (!classification) {
    return {
      name: "",
      steps: DEFAULT_STEPS.map((name) => ({ id: "", name, wage: "", cost: "", selling: "" })),
    };
  }

  return {
    name: classification.name,
    steps: classification.steps.map((step) => ({
      id: step.id,
      name: step.name,
      wage: rateField(step.wage),
      cost: rateField(step.cost),
      selling: rateField(step.selling),
    })),
  };
}

function ClassificationSheet({
  open,
  onOpenChange,
  classification,
  nextSortOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classification?: WageClassification;
  nextSortOrder: number;
}) {
  const save = useSaveWageClassification();
  const isEditing = Boolean(classification);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(classification),
  });

  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "steps" });

  useEffect(() => {
    if (open) form.reset(toFormValues(classification));
  }, [open, classification, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: classification?.id,
        values: {
          name: values.name.trim(),
          sortOrder: classification?.sortOrder ?? nextSortOrder,
          steps: values.steps.map((step) => ({
            id: step.id || null,
            name: step.name.trim(),
            wage: parseRate(step.wage),
            cost: parseRate(step.cost),
            selling: parseRate(step.selling),
          })),
        },
      });

      toast.success(isEditing ? "Classement mis à jour." : "Classement créé.");
      onOpenChange(false);
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "Impossible d'enregistrer ce classement.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le classement" : "Nouveau classement"}</SheetTitle>
          <SheetDescription>
            Les échelons dans l&apos;ordre où on les monte. Un taux pas encore établi peut rester vide.
          </SheetDescription>
        </SheetHeader>

        <form
          id="classification-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="classification-name">
                    Titre
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="classification-name"
                    placeholder={ex("Commercial")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div>
              <div className="mb-2 hidden grid-cols-[1fr_6rem_6rem_6rem_6.5rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>Échelon</span>
                <span>Salaire</span>
                <span>Coûtant</span>
                <span>Vendant</span>
                <span className="sr-only">Actions</span>
              </div>

              <div className="space-y-3 sm:space-y-2">
                {fields.map((row, index) => {
                  const errors = form.formState.errors.steps?.[index];
                  const message =
                    errors?.name?.message ?? errors?.wage?.message ?? errors?.cost?.message ?? errors?.selling?.message;

                  return (
                    <div key={row.id} className="rounded-lg border border-border p-3 sm:rounded-none sm:border-0 sm:p-0">
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-[1fr_6rem_6rem_6rem_6.5rem]">
                        <Input
                          {...form.register(`steps.${index}.name`)}
                          aria-label={`Nom de l'échelon ${index + 1}`}
                          placeholder={ex("Apprenti 1")}
                          aria-invalid={Boolean(errors?.name)}
                          className="col-span-3 sm:col-span-1"
                        />
                        {(["wage", "cost", "selling"] as const).map((key) => (
                          <Input
                            key={key}
                            {...form.register(`steps.${index}.${key}`)}
                            inputMode="decimal"
                            aria-label={`${key === "wage" ? "Salaire" : key === "cost" ? "Coûtant" : "Vendant"} de l'échelon ${index + 1}`}
                            placeholder={key === "wage" ? "Salaire" : key === "cost" ? "Coûtant" : "Vendant"}
                            aria-invalid={Boolean(errors?.[key])}
                            className="tabular-nums"
                          />
                        ))}
                        <div className="col-span-3 flex justify-end gap-1 sm:col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Monter l'échelon ${index + 1}`}
                            disabled={index === 0}
                            onClick={() => move(index, index - 1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Descendre l'échelon ${index + 1}`}
                            disabled={index === fields.length - 1}
                            onClick={() => move(index, index + 1)}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Retirer l'échelon ${index + 1}`}
                            onClick={() => remove(index)}
                          >
                            <X />
                          </Button>
                        </div>
                      </div>
                      {message && <p className="mt-1 text-xs text-destructive">{message}</p>}
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => append({ id: "", name: "", wage: "", cost: "", selling: "" })}
              >
                <Plus />
                Ajouter un échelon
              </Button>
              <FieldDescription className="mt-2">
                Taux à l&apos;heure. Le salaire est ce que l&apos;employé touche, le coûtant ce que
                l&apos;heure vous coûte avec les charges, le vendant ce que le client paie.
              </FieldDescription>
            </div>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="classification-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le classement"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
