"use client";

import { Fragment, useEffect, useState } from "react";
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
import type { WageClassification, WageRateKey } from "@/lib/types";

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
      wageTimeAndHalf: rate,
      costTimeAndHalf: rate,
      sellingTimeAndHalf: rate,
      wageDouble: rate,
      costDouble: rate,
      sellingDouble: rate,
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

/** The three kinds of figure, as columns. */
const KINDS = [
  { key: "wage", label: "Salaire" },
  { key: "cost", label: "Coûtant" },
  { key: "selling", label: "Vendant" },
] as const;

/**
 * The three rates, as rows, with the factor each one starts from. The factor is only where the
 * field starts: a decree that sets overtime at something else is typed over it.
 */
const RATES = [
  { suffix: "", label: "Régulier", factor: 1 },
  { suffix: "TimeAndHalf", label: "Temps et demi", factor: 1.5 },
  { suffix: "Double", label: "Temps double", factor: 2 },
] as const;

type Kind = (typeof KINDS)[number]["key"];
type RateSuffix = (typeof RATES)[number]["suffix"];

function rateKey(kind: Kind, suffix: RateSuffix): WageRateKey {
  return `${kind}${suffix}` as WageRateKey;
}

const ALL_RATE_KEYS: WageRateKey[] = RATES.flatMap((r) => KINDS.map((k) => rateKey(k.key, r.suffix)));

const EMPTY_RATES = Object.fromEntries(ALL_RATE_KEYS.map((key) => [key, ""])) as Record<WageRateKey, string>;

/** Regular × factor, as the field shows it; empty when the regular figure is not a number yet. */
function scaled(regular: string, factor: number): string {
  const value = parseRate(regular);
  if (value == null || Number.isNaN(value)) return "";
  return rateField(Math.round(value * factor * 100) / 100);
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
                          <TableHead>Taux</TableHead>
                          <TableHead className="w-28 text-right">Salaire</TableHead>
                          <TableHead className="w-28 text-right">Coûtant</TableHead>
                          <TableHead className="w-28 text-right">Vendant</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classification.steps.flatMap((step) =>
                          RATES.map((rateRow, rowIndex) => (
                            <TableRow key={`${step.id}-${rateRow.suffix}`} className={rowIndex < RATES.length - 1 ? "border-b-0" : undefined}>
                              {rowIndex === 0 && (
                                <TableCell rowSpan={RATES.length} className="align-top font-medium">
                                  {step.name}
                                </TableCell>
                              )}
                              <TableCell className="text-muted-foreground">{rateRow.label}</TableCell>
                              {KINDS.map((kind) => (
                                <TableCell key={kind.key} className="text-right tabular-nums">
                                  {hourly(step[rateKey(kind.key, rateRow.suffix)])}
                                </TableCell>
                              ))}
                            </TableRow>
                          )),
                        )}
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
      steps: DEFAULT_STEPS.map((name) => ({ id: "", name, ...EMPTY_RATES })),
    };
  }

  return {
    name: classification.name,
    steps: classification.steps.map((step) => ({
      id: step.id,
      name: step.name,
      ...(Object.fromEntries(ALL_RATE_KEYS.map((key) => [key, rateField(step[key])])) as Record<WageRateKey, string>),
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

  /**
   * Typing a regular rate carries it to time and a half and double time — but only into a field
   * that is empty or still holds what the previous regular figure gave. One somebody typed over
   * is theirs and stays.
   */
  function fillOvertime(index: number, kind: Kind, next: string) {
    const previous = form.getValues(`steps.${index}.${kind}`);
    for (const rateRow of RATES) {
      if (rateRow.factor === 1) continue;
      const key = rateKey(kind, rateRow.suffix);
      const current = form.getValues(`steps.${index}.${key}`);
      if (current.trim() === "" || current === scaled(previous, rateRow.factor)) {
        form.setValue(`steps.${index}.${key}`, scaled(next, rateRow.factor), { shouldValidate: true });
      }
    }
  }

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
            ...(Object.fromEntries(ALL_RATE_KEYS.map((key) => [key, parseRate(step[key])])) as Record<
              WageRateKey,
              number | null
            >),
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
              <div className="space-y-3">
                {fields.map((row, index) => {
                  const errors = form.formState.errors.steps?.[index];
                  const message =
                    errors?.name?.message ?? ALL_RATE_KEYS.map((key) => errors?.[key]?.message).find(Boolean);

                  return (
                    <div key={row.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-1">
                        <Input
                          {...form.register(`steps.${index}.name`)}
                          aria-label={`Nom de l'échelon ${index + 1}`}
                          placeholder={ex("Apprenti 1")}
                          aria-invalid={Boolean(errors?.name)}
                          className="flex-1"
                        />
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

                      <div className="mt-2 grid grid-cols-[5.5rem_repeat(3,minmax(0,1fr))] items-center gap-1.5">
                        <span />
                        {KINDS.map((kind) => (
                          <span key={kind.key} className="text-xs font-medium text-muted-foreground">
                            {kind.label}
                          </span>
                        ))}
                        {RATES.map((rateRow) => (
                          <Fragment key={rateRow.suffix || "regular"}>
                            <span className="text-xs text-muted-foreground">{rateRow.label}</span>
                            {KINDS.map((kind) => {
                              const key = rateKey(kind.key, rateRow.suffix);
                              const registered = form.register(`steps.${index}.${key}`);
                              return (
                                <Input
                                  key={key}
                                  {...registered}
                                  onChange={(event) => {
                                    if (rateRow.factor === 1) fillOvertime(index, kind.key, event.target.value);
                                    return registered.onChange(event);
                                  }}
                                  inputMode="decimal"
                                  aria-label={`${kind.label}, ${rateRow.label.toLowerCase()}, échelon ${index + 1}`}
                                  aria-invalid={Boolean(errors?.[key])}
                                  className="tabular-nums"
                                />
                              );
                            })}
                          </Fragment>
                        ))}
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
                onClick={() => append({ id: "", name: "", ...EMPTY_RATES })}
              >
                <Plus />
                Ajouter un échelon
              </Button>
              <FieldDescription className="mt-2">
                Taux à l&apos;heure. Le salaire est ce que l&apos;employé touche, le coûtant ce que
                l&apos;heure vous coûte avec les charges, le vendant ce que le client paie. Le temps
                et demi et le temps double se remplissent à 1,5 et 2 fois le régulier ; changez-les
                si votre convention dit autre chose.
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
