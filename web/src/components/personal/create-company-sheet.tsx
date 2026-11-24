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
import { CompanyAddressFields } from "@/components/addresses/company-address-fields";
import { usePublicPlansQuery } from "@/hooks/use-catalog";
import { useCreateMyCompany } from "@/hooks/use-my-companies";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { checkCompanyAddress, companyProfileFrom, emptyCompanyAddress } from "@/lib/company-signup";
import { defaultCountryName } from "@/lib/geo";
import { formatCents } from "@/lib/money";
import { ex } from "@/lib/placeholders";
import { cn } from "@/lib/utils";

const formSchema = z
  .object({
    accountType: z.literal("business"),
    companyName: z.string().trim().min(2, "Nom d'entreprise requis.").max(200, "200 caractères maximum."),
    planId: z.string().min(1, "Choisissez un forfait."),
    line1: z.string(),
    line2: z.string(),
    city: z.string(),
    province: z.string(),
    postalCode: z.string(),
    country: z.string(),
    businessNumber: z.string(),
  })
  // The same address rules as a sign-up, because the server applies the same ones.
  .superRefine(checkCompanyAddress);

type FormValues = z.infer<typeof formSchema>;

function emptyValues(): FormValues {
  return {
    accountType: "business",
    companyName: "",
    planId: "",
    ...emptyCompanyAddress(defaultCountryName),
  };
}

/**
 * Opening a company from an account that already exists.
 *
 * The questions a sign-up asks about a company — its name, where it is, which plan — and none
 * of the ones about the person, who is already signed in. Once it exists the person is switched
 * into it: straight to Stripe when the plan is paid up front, to its dashboard when it opens on
 * a trial.
 */
export function CreateCompanySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateMyCompany();
  const { enterWorkspace } = useAuth();
  const { data: plans, isLoading: plansLoading } = usePublicPlansQuery();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyValues(),
  });

  useEffect(() => {
    if (open) form.reset(emptyValues());
  }, [open, form]);

  async function onSubmit(values: FormValues) {
    try {
      const result = await create.mutateAsync({
        companyName: values.companyName.trim(),
        planId: values.planId,
        profile: companyProfileFrom(values, false),
      });

      // Into the new company first, so that coming back from Stripe lands there and not in
      // the personal space the form was opened from.
      await enterWorkspace(result.tenantId);

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }

      toast.success(`${values.companyName.trim()} est ouverte.`);
    } catch (error) {
      toast.error(
        error instanceof ApiError || error instanceof Error ? error.message : "Impossible de créer l'entreprise.",
      );
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Créer une entreprise</SheetTitle>
          <SheetDescription>
            Elle s&apos;ajoute à vos espaces : vous en êtes l&apos;administrateur, et votre espace
            personnel reste le vôtre.
          </SheetDescription>
        </SheetHeader>

        <form
          id="create-company-form"
          className="flex-1 overflow-y-auto px-4"
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="companyName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="company-name">
                    Nom de l&apos;entreprise
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="company-name"
                    placeholder={ex("Toitures Tremblay inc.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <CompanyAddressFields form={form} idPrefix="new-company" />

            <Controller
              name="planId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    Forfait
                    <RequiredMark />
                  </FieldLabel>

                  {plansLoading ? (
                    <FieldDescription>Chargement des forfaits…</FieldDescription>
                  ) : !plans || plans.length === 0 ? (
                    <FieldDescription>Aucun forfait n&apos;est offert pour le moment.</FieldDescription>
                  ) : (
                    <div role="radiogroup" aria-label="Forfait" className="space-y-2">
                      {plans.map((plan) => {
                        const selected = field.value === plan.id;
                        return (
                          <button
                            key={plan.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => field.onChange(plan.id)}
                            className={cn(
                              "flex w-full items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                              "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                              selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">{plan.name}</span>
                              {plan.trialDays > 0 && (
                                <span className="block text-xs text-primary">
                                  {plan.trialDays} jours gratuits, sans carte de crédit
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-sm tabular-nums text-foreground">
                              {formatCents(plan.amountCents, plan.currency)}
                              <span className="text-muted-foreground"> /mois</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="create-company-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            Créer l&apos;entreprise
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
