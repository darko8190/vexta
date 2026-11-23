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
import { useSaveFeature } from "@/hooks/use-features";
import { ApiError } from "@/lib/api";
import { MODULE_ICON_NAMES, moduleIcon } from "@/lib/module-icons";
import { cn } from "@/lib/utils";
import type { FeatureRecord } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "La clé est requise.")
    .max(40, "40 caractères maximum.")
    .regex(/^[a-z0-9_-]+$/, "Minuscules, chiffres, tiret et tiret bas seulement."),
  name: z.string().trim().min(1, "Le nom est requis.").max(60, "60 caractères maximum."),
  description: z.string().trim().min(1, "La description est requise.").max(300, "300 caractères maximum."),
  icon: z.string().min(1, "Choisissez une icône."),
  sortOrder: z.string().trim().regex(/^\d{1,3}$/, "Entrez un nombre entre 0 et 999."),
  isPublished: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(feature?: FeatureRecord): FormValues {
  return {
    key: feature?.key ?? "",
    name: feature?.name ?? "",
    description: feature?.description ?? "",
    icon: feature?.icon ?? "Sparkles",
    sortOrder: String(feature?.sortOrder ?? 0),
    isPublished: feature?.isPublished ?? true,
  };
}

export function FeatureFormSheet({
  open,
  onOpenChange,
  feature,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: FeatureRecord;
}) {
  const isEditing = Boolean(feature);
  const save = useSaveFeature();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(feature),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(feature));
  }, [open, feature, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        id: feature?.id,
        values: { ...values, sortOrder: Number(values.sortOrder) },
      });
      toast.success(isEditing ? "Fonctionnalité mise à jour." : "Fonctionnalité créée.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Impossible d'enregistrer cette fonctionnalité.",
      );
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Modifier la fonctionnalité" : "Nouvelle fonctionnalité"}
          </SheetTitle>
          <SheetDescription>
            Un module est un onglet ; une fonctionnalité est ce qu&apos;une entreprise a le droit
            de faire dedans.
          </SheetDescription>
        </SheetHeader>

        <form
          id="feature-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="icon"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Icône</FieldLabel>
                  <div role="radiogroup" aria-label="Icône de la fonctionnalité" className="grid grid-cols-8 gap-2">
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
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="feature-name">Nom</FieldLabel>
                  <Input
                    {...field}
                    id="feature-name"
                    placeholder={ex("Assistant IA")}
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
                  <FieldLabel htmlFor="feature-description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    id="feature-description"
                    rows={3}
                    placeholder={ex("Ce que l'entreprise obtient en cochant cette case.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="key"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="feature-key">Clé</FieldLabel>
                  <Input
                    {...field}
                    id="feature-key"
                    placeholder={ex("signature-electronique")}
                    disabled={feature?.isBuiltIn}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      {feature?.isBuiltIn
                        ? "Cette fonctionnalité fait partie de Vexta : sa clé ne peut pas changer, parce que c'est elle que le code vérifie. Le nom et la description, eux, sont à vous."
                        : "C'est ce que le code vérifiera. Une clé seule ne fait rien tant que l'application ne la connaît pas : créez-la ici, puis demandez qu'on la branche."}
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            <Controller
              name="sortOrder"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="feature-order">Ordre d&apos;affichage</FieldLabel>
                  <Input {...field} id="feature-order" inputMode="numeric" />
                  <FieldDescription>Les plus petits nombres apparaissent en premier.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="isPublished"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="feature-published"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="feature-published">
                    Montrer sur la page des tarifs
                  </FieldLabel>
                </Field>
              )}
            />
            <FieldDescription>
              Décoché, la fonctionnalité existe et se coche quand même sur un forfait : elle est
              simplement vendue sans être annoncée.
            </FieldDescription>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="feature-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer la fonctionnalité"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
