"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { useModulesQuery, useSavePlan } from "@/hooks/use-catalog";
import { ApiError } from "@/lib/api";
import { centsToFieldValue, parseAmountToCents } from "@/lib/money";
import { moduleIcon } from "@/lib/module-icons";
import type { PlanRecord } from "@/lib/types";

const MIN_CENTS = 100;
const MAX_CENTS = 10_000_000;
const MAX_SEATS = 500;

// Shared by both ends of the range: same rule, same wording.
const seatField = z
  .string()
  .trim()
  .regex(/^\d{1,3}$/, "Entrez un nombre.")
  .refine((v) => Number(v) >= 1, "Au moins 1 : le propriétaire compte dans le total.")
  .refine((v) => Number(v) <= MAX_SEATS, `${MAX_SEATS} au maximum.`);

const formSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(60, "60 caractères maximum."),
  description: z.string().trim().max(300, "300 caractères maximum."),
  amount: z
    .string()
    .trim()
    .min(1, "Entrez un montant.")
    .refine((v) => parseAmountToCents(v) !== null, "Écrivez un montant comme 49 ou 49,99.")
    .refine((v) => (parseAmountToCents(v) ?? 0) >= MIN_CENTS, "Le tarif minimum est de 1 $.")
    .refine((v) => (parseAmountToCents(v) ?? 0) <= MAX_CENTS, "Le tarif maximum est de 100 000 $."),
  minUsers: seatField,
  maxUsers: seatField,
  // A string for the same reason as the amount: coercion breaks the resolver's typing.
  sortOrder: z.string().trim().regex(/^\d{1,3}$/, "Entrez un nombre entre 0 et 999."),
  isPublished: z.boolean(),
  moduleIds: z.array(z.string()),
});

// On the object rather than on either field: a range is only wrong as a pair, and the message
// belongs on the maximum, which is the one the super admin just typed.
const planSchema = formSchema.refine(
  (values) => Number(values.minUsers) <= Number(values.maxUsers),
  { message: "Le maximum doit être au moins égal au minimum.", path: ["maxUsers"] },
);

type FormValues = z.infer<typeof formSchema>;

function toFormValues(plan?: PlanRecord): FormValues {
  return {
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    amount: plan ? centsToFieldValue(plan.amountCents) : "",
    minUsers: String(plan?.minUsers ?? 1),
    maxUsers: String(plan?.maxUsers ?? 1),
    sortOrder: String(plan?.sortOrder ?? 0),
    isPublished: plan?.isPublished ?? false,
    moduleIds: plan?.modules.map((m) => m.id) ?? [],
  };
}

export function PlanFormSheet({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: PlanRecord;
}) {
  const isEditing = Boolean(plan);
  const save = useSavePlan();
  const { data: modules } = useModulesQuery();

  const form = useForm<FormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: toFormValues(plan),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(plan));
  }, [open, plan, form]);

  async function onSubmit(values: FormValues) {
    const amountCents = parseAmountToCents(values.amount);
    if (amountCents == null) return;

    try {
      await save.mutateAsync({
        id: plan?.id,
        values: {
          name: values.name,
          description: values.description ? values.description : null,
          amountCents,
          minUsers: Number(values.minUsers),
          maxUsers: Number(values.maxUsers),
          sortOrder: Number(values.sortOrder),
          isPublished: values.isPublished,
          moduleIds: values.moduleIds,
        },
      });
      toast.success(isEditing ? "Forfait mis à jour." : "Forfait créé.");
      onOpenChange(false);
    } catch (error) {
      // The API explains refusals in French: no Stripe key, Stripe saying no, a bad amount.
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer le forfait.");
    }
  }

  // useWatch, not form.watch: the React Compiler lint rejects the latter inside render.
  const watchedAmount = useWatch({ control: form.control, name: "amount" });
  const amountChanged = isEditing && parseAmountToCents(watchedAmount ?? "") !== plan?.amountCents;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier le forfait" : "Nouveau forfait"}</SheetTitle>
          <SheetDescription>
            Les forfaits publiés s&apos;affichent sur le site public et peuvent être choisis à l&apos;inscription.
          </SheetDescription>
        </SheetHeader>

        <form
          id="plan-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="plan-name">Nom du forfait</FieldLabel>
                  <Input {...field} id="plan-name" placeholder="Essentiel" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="plan-description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    id="plan-description"
                    rows={2}
                    placeholder="Pour une petite équipe qui démarre."
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="amount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="plan-amount">Tarif mensuel (CAD)</FieldLabel>
                  <Input
                    {...field}
                    id="plan-amount"
                    inputMode="decimal"
                    placeholder="49"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    {fieldState.error?.message ??
                      (amountChanged
                        ? "Changer le montant crée un nouveau prix dans Stripe. Les abonnements en cours gardent l'ancien tarif jusqu'à ce que vous les migriez dans Stripe."
                        : "Enregistrer crée le prix correspondant dans Stripe.")}
                  </FieldDescription>
                </Field>
              )}
            />

            <Field>
              <FieldLabel>Nombre d&apos;utilisateurs</FieldLabel>
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  name="minUsers"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="plan-min-users" className="text-xs font-normal text-muted-foreground">
                        Minimum
                      </FieldLabel>
                      <Input
                        {...field}
                        id="plan-min-users"
                        inputMode="numeric"
                        placeholder="1"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="maxUsers"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="plan-max-users" className="text-xs font-normal text-muted-foreground">
                        Maximum
                      </FieldLabel>
                      <Input
                        {...field}
                        id="plan-max-users"
                        inputMode="numeric"
                        placeholder="5"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </div>
              <FieldDescription>
                Le propriétaire compte dans le total. Seul le maximum est appliqué : au-delà,
                la case « Accès » ne peut plus être cochée. Le minimum sert à situer le forfait
                sur la page des tarifs. Baisser le maximum ne déconnecte personne — les
                entreprises déjà au-dessus gardent leurs accès jusqu&apos;à ce qu&apos;elles en retirent.
              </FieldDescription>
            </Field>

            <Controller
              name="moduleIds"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel>Modules inclus</FieldLabel>
                  {!modules || modules.length === 0 ? (
                    <FieldDescription>
                      Aucun module n&apos;existe encore. Créez-en dans la page Modules pour pouvoir les inclure ici.
                    </FieldDescription>
                  ) : (
                    <div className="space-y-2">
                      {modules.map((module) => {
                        const Icon = moduleIcon(module.icon);
                        const checked = field.value.includes(module.id);
                        return (
                          <label
                            key={module.id}
                            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/40"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) =>
                                field.onChange(
                                  next === true
                                    ? [...field.value, module.id]
                                    : field.value.filter((id: string) => id !== module.id),
                                )
                              }
                            />
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="text-sm text-foreground">{module.title}</span>
                            {!module.isPublished && (
                              <span className="ml-auto text-xs text-muted-foreground">masqué</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Field>
              )}
            />

            <Controller
              name="sortOrder"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="plan-order">Ordre d&apos;affichage</FieldLabel>
                  <Input {...field} id="plan-order" inputMode="numeric" />
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
                    id="plan-published"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldLabel htmlFor="plan-published">Offrir ce forfait au public</FieldLabel>
                </Field>
              )}
            />
            <FieldDescription>
              Un forfait ne peut être publié que si Stripe est configuré : afficher un prix que
              personne ne peut payer est pire que ne rien afficher.
            </FieldDescription>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="plan-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {isEditing ? "Enregistrer" : "Créer le forfait"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
