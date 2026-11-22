"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
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
import { useModulesQuery } from "@/hooks/use-catalog";
import { useReportKeysQuery, useSaveReport } from "@/hooks/use-reports";
import { ApiError } from "@/lib/api";
import { MODULE_ICON_NAMES, moduleIcon } from "@/lib/module-icons";
import type { AdminReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  moduleId: z.string().min(1, "Choisissez le module auquel ce rapport appartient."),
  key: z.string().min(1, "Choisissez le calcul à exécuter."),
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(120, "120 caractères maximum."),
  description: z
    .string()
    .trim()
    .min(1, "La description est obligatoire.")
    .max(500, "500 caractères maximum."),
  icon: z.string().min(1, "Choisissez une icône."),
  // A string, like the module form: z.coerce.number() types the form input as unknown and
  // the resolver stops matching the values the fields hold.
  sortOrder: z.string().trim().regex(/^\d{1,3}$/, "Entrez un nombre entre 0 et 999."),
  isPublished: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(report?: AdminReport): FormValues {
  return {
    moduleId: report?.moduleId ?? "",
    key: report?.key ?? "",
    title: report?.title ?? "",
    description: report?.description ?? "",
    icon: report?.icon ?? "ChartBar",
    sortOrder: String(report?.sortOrder ?? 0),
    isPublished: report?.isPublished ?? true,
  };
}

/**
 * One report in the catalogue.
 *
 * The module is the field that matters: it is what decides which companies are offered this
 * report, because a plan includes modules and nothing else. Choosing the wrong one is how a
 * report meant for Inventaire ends up on the page of a company that never bought it.
 */
export function ReportFormSheet({
  open,
  onOpenChange,
  report,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report?: AdminReport;
}) {
  const isEditing = Boolean(report);
  const save = useSaveReport();
  const { data: modules } = useModulesQuery();
  const { data: keys } = useReportKeysQuery();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(report),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(report));
  }, [open, report, form]);

  const options = keys ?? [];
  const moduleList = modules ?? [];

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: report?.id,
        values: { ...values, sortOrder: Number(values.sortOrder) },
      });
      toast.success(isEditing ? "Rapport mis à jour." : "Rapport créé.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible d'enregistrer ce rapport.",
      );
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le rapport" : "Nouveau rapport"}</SheetTitle>
          <SheetDescription>
            Un rapport appartient à un module : seules les entreprises dont le forfait inclut ce
            module se le font offrir.
          </SheetDescription>
        </SheetHeader>

        <form
          id="report-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="moduleId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="report-module">
                    Module
                    <RequiredMark />
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="report-module" className="w-full">
                      <SelectValue>
                        {(value: string) =>
                          moduleList.find((m) => m.id === value)?.title ?? "Choisir un module"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {moduleList.map((module) => (
                        <SelectItem key={module.id} value={module.id}>
                          {module.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      C&apos;est ce module qui décide à qui le rapport est offert.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="key"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="report-key">
                    Calcul
                    <RequiredMark />
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="report-key" className="w-full">
                      <SelectValue>
                        {(value: string) =>
                          options.find((o) => o.key === value)?.label ?? "Choisir un calcul"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                          {!option.isImplemented && " — à venir"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      « À venir » signifie que le rapport peut être défini et placé dès
                      maintenant ; la page le dira jusqu&apos;à ce que le calcul soit en place.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="report-title">
                    Titre
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="report-title"
                    placeholder="Heures par employé"
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
                  <FieldLabel htmlFor="report-description">
                    Description
                    <RequiredMark />
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="report-description"
                    rows={3}
                    placeholder="Les heures inscrites par chacun, et sur combien de chantiers."
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="icon"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Icône</FieldLabel>
                  <div role="radiogroup" aria-label="Icône du rapport" className="grid grid-cols-8 gap-2">
                    {MODULE_ICON_NAMES.map((name) => {
                      const Icon = moduleIcon(name);
                      const selected = field.value === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={name}
                          onClick={() => field.onChange(name)}
                          className={cn(
                            "flex size-9 items-center justify-center rounded-lg border transition-colors",
                            "focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </button>
                      );
                    })}
                  </div>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="sortOrder"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="report-order">Ordre</FieldLabel>
                  <Input
                    {...field}
                    id="report-order"
                    type="number"
                    min="0"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Dans son module. Les modules sont déjà ordonnés entre eux.
                  </FieldDescription>
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
                    id="report-published"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="report-published" className="font-normal">
                    Publié
                  </FieldLabel>
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="report-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le rapport"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
