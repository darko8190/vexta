"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  useBillingSettingsQuery,
  useSavePricing,
  type BillingSettings,
} from "@/hooks/use-billing-settings";
import { ApiError } from "@/lib/api";

/** "85", "85,50" and "85.50" all, because a rate is written with a comma here. */
const AMOUNT = /^\d+([.,]\d{1,2})?$/;

const formSchema = z.object({
  hourlyRate: z
    .string()
    .trim()
    .refine((value) => value === "" || AMOUNT.test(value.replace(/\s/g, "")), {
      message: "Écrivez un montant, par exemple 85 ou 85,50.",
    }),
});

type FormValues = z.infer<typeof formSchema>;

function money(amount: number): string {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(amount);
}

function toFormValues(settings?: BillingSettings): FormValues {
  const rate = settings?.defaultHourlyRate;
  if (rate == null) return { hourlyRate: "" };

  return { hourlyRate: rate % 1 === 0 ? String(rate) : rate.toFixed(2).replace(".", ",") };
}

/**
 * What an hour of labour costs by default.
 *
 * Left empty on purpose by a company that prices every job on its own: the field is the
 * starting point of a Main-d'œuvre line, never a ceiling, and nothing refuses to work without
 * it.
 */
export function HourlyRateCard() {
  const { data: settings, isLoading } = useBillingSettingsQuery();
  const save = useSavePricing();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(settings),
  });

  useEffect(() => {
    if (settings) form.reset(toFormValues(settings));
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    const typed = values.hourlyRate.replace(/\s/g, "").replace(",", ".");

    try {
      await save.mutateAsync({
        defaultHourlyRate: typed === "" ? null : Number(typed),
        marginMode: settings?.marginMode ?? "Multiplication",
        defaultPricePolicyId: settings?.defaultPricePolicyId ?? null,
      });
      toast.success("Taux horaire enregistré.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce taux.");
    }
  }

  if (isLoading) return <Skeleton className="h-64 max-w-2xl" />;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4" />
          Taux horaire
        </CardTitle>
        <CardDescription>
          {settings?.defaultHourlyRate != null
            ? `Une heure de main-d'œuvre est facturée ${money(settings.defaultHourlyRate)} par défaut.`
            : "Aucun taux enregistré : une ligne de main-d'œuvre part alors d'un montant vide."}
        </CardDescription>
      </CardHeader>

      <form id="hourly-rate-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <FieldGroup>
            <Controller
              name="hourlyRate"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="max-w-xs">
                  <FieldLabel htmlFor="default-hourly-rate">Taux horaire par défaut</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="default-hourly-rate"
                      inputMode="decimal"
                      placeholder="85,00"
                      aria-invalid={fieldState.invalid}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>$ / h</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      C&apos;est le prix de départ d&apos;une ligne Main-d&apos;œuvre sur une
                      facture. Chaque ligne reste modifiable.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>

        <CardFooter>
          <Button type="submit" form="hourly-rate-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            Enregistrer
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
