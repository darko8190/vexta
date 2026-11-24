"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TaskPickerField } from "@/components/projects/detail/task-picker-field";
import { useSaveExtraCharge } from "@/hooks/use-extra-charges";
import { ApiError } from "@/lib/api";
import type { ProjectExtraCharge } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(200, "200 caractères maximum."),
  description: z.string().trim().max(2000, "2000 caractères maximum."),
  cost: z.string(),
  sellingPrice: z.string(),
  chargedOn: z.string(),
  projectTaskId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

/** "49,99" and "49.99" both, because a price is typed with a comma here. */
function parseAmount(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+([.]\d{1,2})?$/.test(normalized)) return "invalid";

  return Number(normalized);
}

function amountField(value: number | null | undefined): string {
  if (value == null) return "";
  return value % 1 === 0 ? String(value) : value.toFixed(2).replace(".", ",");
}

function toFormValues(charge?: ProjectExtraCharge): FormValues {
  return {
    name: charge?.name ?? "",
    description: charge?.description ?? "",
    cost: amountField(charge?.cost),
    sellingPrice: amountField(charge?.sellingPrice),
    chargedOn: charge?.chargedOn ?? "",
    projectTaskId: charge?.projectTaskId ?? "",
  };
}

/**
 * One extra charge on a project.
 *
 * The expense form without the camera. An expense is proved by its receipt, so that form is
 * built around attaching one; a charge the company decided to add has nothing to photograph,
 * and a photo button here would only invite people to file receipts where the cost table
 * cannot see them.
 */
export function ExtraChargeFormSheet({
  open,
  onOpenChange,
  projectId,
  charge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  charge?: ProjectExtraCharge;
}) {
  const isEditing = Boolean(charge);
  const save = useSaveExtraCharge(projectId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(charge),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(charge));
  }, [open, charge, form]);

  async function onSubmit(values: FormValues) {
    const cost = parseAmount(values.cost);
    const sellingPrice = parseAmount(values.sellingPrice);

    if (cost === "invalid" || sellingPrice === "invalid") {
      toast.error("Un montant doit s'écrire comme 1250 ou 1250,99.");
      return;
    }

    try {
      await save.mutateAsync({
        id: charge?.id,
        values: {
          name: values.name,
          description: values.description || null,
          cost,
          sellingPrice,
          chargedOn: values.chargedOn || null,
          projectTaskId: values.projectTaskId || null,
        },
      });

      toast.success(isEditing ? "Frais mis à jour." : "Frais ajouté.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce frais.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le frais" : "Nouveau frais"}</SheetTitle>
          <SheetDescription>
            Ce qui s&apos;ajoute à la facture et qui n&apos;était pas dans la soumission.
          </SheetDescription>
        </SheetHeader>

        <form
          id="extra-charge-form"
          className="flex-1 overflow-y-auto px-4"
          // Stops here rather than bubbling: this panel is opened from a page that may itself sit
          // inside a form, and React routes a submit up its own tree regardless of the portal.
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
                  <FieldLabel htmlFor="charge-name">
                    Nom
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="charge-name"
                    placeholder={ex("Déplacement supplémentaire")}
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
                  <FieldLabel htmlFor="charge-description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    id="charge-description"
                    rows={3}
                    placeholder={ex("Retour sur le chantier pour une pièce manquante")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="cost"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="charge-cost">Coût</FieldLabel>
                    <Input {...field} id="charge-cost" inputMode="decimal" placeholder={ex("0,00")} />
                    <FieldDescription>Ce que ça vous a coûté.</FieldDescription>
                  </Field>
                )}
              />
              <Controller
                name="sellingPrice"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="charge-selling">Vendant</FieldLabel>
                    <Input {...field} id="charge-selling" inputMode="decimal" placeholder={ex("0,00")} />
                    <FieldDescription>Ce que le client paie.</FieldDescription>
                  </Field>
                )}
              />
            </div>

            <Controller
              name="chargedOn"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="charge-date">Date</FieldLabel>
                  <Input {...field} id="charge-date" type="date" />
                </Field>
              )}
            />

            <Controller
              name="projectTaskId"
              control={form.control}
              render={({ field }) => (
                <TaskPickerField
                  id="charge-task"
                  projectId={projectId}
                  value={field.value || null}
                  onChange={(taskId) => field.onChange(taskId ?? "")}
                />
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="extra-charge-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Ajouter le frais"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
