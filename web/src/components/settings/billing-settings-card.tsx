"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  toSaveValues,
  useBillingSettingsQuery,
  useSaveBillingSettings,
  type BillingSettings,
} from "@/hooks/use-billing-settings";
import { ApiError } from "@/lib/api";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  gstNumber: z.string().trim().max(40, "40 caractères maximum."),
  qstNumber: z.string().trim().max(40, "40 caractères maximum."),
  rbqNumber: z.string().trim().max(40, "40 caractères maximum."),
  gstRate: z.string().min(1, "Taux requis."),
  qstRate: z.string().min(1, "Taux requis."),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Trois lettres, comme CAD, USD ou EUR."),
  invoicePrefix: z.string().trim().min(1, "Le préfixe est requis.").max(10, "10 caractères maximum."),
  nextInvoiceNumber: z.string().min(1, "Numéro requis."),
  paymentTermsDays: z.string().min(1, "Délai requis."),
  terms: z.string().trim().max(2000, "2000 caractères maximum."),
  footerNote: z.string().trim().max(2000, "2000 caractères maximum."),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(settings?: BillingSettings): FormValues {
  return {
    gstNumber: settings?.gstNumber ?? "",
    qstNumber: settings?.qstNumber ?? "",
    rbqNumber: settings?.rbqNumber ?? "",
    gstRate: String(settings?.gstRate ?? 5),
    qstRate: String(settings?.qstRate ?? 9.975),
    currency: settings?.currency ?? "CAD",
    invoicePrefix: settings?.invoicePrefix ?? "F",
    nextInvoiceNumber: String(settings?.nextInvoiceNumber ?? 1),
    paymentTermsDays: String(settings?.paymentTermsDays ?? 30),
    terms: settings?.terms ?? "",
    footerNote: settings?.footerNote ?? "",
  };
}

/**
 * What a company has to settle before it can invoice anyone. It opens filled with the Québec
 * defaults rather than blank, because a blank tax rate is not a safer starting point than the
 * right one — but nothing is stored until they press the button, and that press is what the
 * invoice endpoints read as "this company has been through this".
 */
export function BillingSettingsCard() {
  const { data: settings, isLoading } = useBillingSettingsQuery();
  const save = useSaveBillingSettings();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(settings),
  });

  useEffect(() => {
    if (settings) form.reset(toFormValues(settings));
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    try {
      await save.mutateAsync({
        // The hourly rate, the margin mode and the default policy live in the same row and are
        // edited in their own sections; they ride along untouched.
        ...toSaveValues(settings),
        gstNumber: values.gstNumber || null,
        qstNumber: values.qstNumber || null,
        rbqNumber: values.rbqNumber || null,
        gstRate: Number(values.gstRate),
        qstRate: Number(values.qstRate),
        // Upper-cased here as well as on the server, so the field someone just typed reads back
        // the way it will be printed rather than the way it was keyed.
        currency: values.currency.toUpperCase(),
        invoicePrefix: values.invoicePrefix,
        nextInvoiceNumber: Number(values.nextInvoiceNumber),
        paymentTermsDays: Number(values.paymentTermsDays),
        terms: values.terms || null,
        footerNote: values.footerNote || null,
      });
      toast.success("Paramètres de facturation enregistrés.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ces paramètres.");
    }
  }

  if (isLoading) return <Skeleton className="h-96 max-w-2xl" />;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" />
            Facturation
          </CardTitle>
          <Badge variant={settings?.configured ? "default" : "secondary"}>
            {settings?.configured ? "Configurée" : "À remplir"}
          </Badge>
        </div>
        <CardDescription>
          {settings?.configured
            ? `La prochaine facture portera le numéro ${settings.nextInvoiceLabel}.`
            : "À remplir une fois avant de pouvoir créer une facture."}
        </CardDescription>
      </CardHeader>

      <form id="billing-settings-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="gstNumber"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="billing-gst">Numéro de TPS</FieldLabel>
                    <Input {...field} id="billing-gst" placeholder={ex("123456789 RT0001")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>Laissez vide si vous n&apos;êtes pas inscrit.</FieldDescription>
                    )}
                  </Field>
                )}
              />
              <Controller
                name="qstNumber"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="billing-qst">Numéro de TVQ</FieldLabel>
                    <Input {...field} id="billing-qst" placeholder={ex("1234567890 TQ0001")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="rbqNumber"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="billing-rbq">Numéro de licence RBQ</FieldLabel>
                  <Input {...field} id="billing-rbq" placeholder={ex("1234-5678-01")} aria-invalid={fieldState.invalid} />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Imprimé sous votre adresse sur chaque facture.</FieldDescription>
                  )}
                </Field>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="gstRate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="billing-gst-rate">Taux de TPS (%)</FieldLabel>
                    <Input {...field} id="billing-gst-rate" type="number" step="0.001" min="0" max="100" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="qstRate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="billing-qst-rate">Taux de TVQ (%)</FieldLabel>
                    <Input {...field} id="billing-qst-rate" type="number" step="0.001" min="0" max="100" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Controller
                name="invoicePrefix"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="billing-prefix">Préfixe</FieldLabel>
                    <Input {...field} id="billing-prefix" placeholder={ex("F")} aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="nextInvoiceNumber"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="billing-next">Prochain numéro</FieldLabel>
                    <Input {...field} id="billing-next" type="number" min="1" step="1" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="paymentTermsDays"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="billing-terms-days">Délai (jours)</FieldLabel>
                    <Input {...field} id="billing-terms-days" type="number" min="0" max="365" step="1" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              {/* Beside the numbering, because it is the same kind of decision: how this
                  company's invoices are written, settled once and then never asked again. */}
              <Controller
                name="currency"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="billing-currency">Devise</FieldLabel>
                    <Input
                      {...field}
                      id="billing-currency"
                      className="uppercase"
                      maxLength={3}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={ex("CAD")}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
            <FieldDescription>
              Le numéro ne peut pas reculer sur une facture déjà émise : il est relevé
              automatiquement si vous essayez. La devise s&apos;applique aux prochaines factures ;
              celles déjà émises gardent la leur.
            </FieldDescription>

            <Controller
              name="terms"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="billing-conditions">Conditions de paiement</FieldLabel>
                  <Textarea
                    {...field}
                    id="billing-conditions"
                    rows={2}
                    placeholder={ex("Payable à réception. Intérêts de 1,5 % par mois sur tout solde en retard.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="footerNote"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="billing-footer">Mentions au bas de la facture</FieldLabel>
                  <Textarea
                    {...field}
                    id="billing-footer"
                    rows={2}
                    placeholder={ex("Merci de votre confiance. Virement : Desjardins, transit 12345, compte 6789012.")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>

        <CardFooter>
          <Button type="submit" form="billing-settings-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            Enregistrer
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
