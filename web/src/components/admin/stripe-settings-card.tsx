"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useUpdatePlatformSettings } from "@/hooks/use-platform-settings";
import type { PlatformSettings } from "@/lib/types";

const formSchema = z.object({
  stripePublishableKey: z.string().optional(),
  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  stripeMonthlyPriceId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function StripeSettingsCard({ settings }: { settings: PlatformSettings }) {
  const update = useUpdatePlatformSettings();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stripePublishableKey: settings.stripePublishableKey ?? "",
      stripeSecretKey: "",
      stripeWebhookSecret: "",
      stripeMonthlyPriceId: settings.stripeMonthlyPriceId ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      stripePublishableKey: settings.stripePublishableKey ?? "",
      stripeSecretKey: "",
      stripeWebhookSecret: "",
      stripeMonthlyPriceId: settings.stripeMonthlyPriceId ?? "",
    });
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    try {
      await update.mutateAsync(values);
      toast.success("Passerelle Stripe enregistrée.");
      form.setValue("stripeSecretKey", "");
      form.setValue("stripeWebhookSecret", "");
    } catch {
      toast.error("Impossible d'enregistrer la configuration Stripe.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" />
            Stripe
          </CardTitle>
          <Badge variant={settings.stripeConfigured ? "default" : "outline"}>
            {settings.stripeConfigured ? "Configuré" : "Non configuré"}
          </Badge>
        </div>
        <CardDescription>Utilisé pour l&apos;abonnement mensuel payant des locataires de Vexta.</CardDescription>
      </CardHeader>

      <form id="stripe-form" onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent>
          <FieldGroup>
            <Controller
              name="stripePublishableKey"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="stripe-pk">Clé publique</FieldLabel>
                  <Input {...field} id="stripe-pk" placeholder="pk_live_…" />
                </Field>
              )}
            />
            <Controller
              name="stripeSecretKey"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="stripe-sk">Clé secrète</FieldLabel>
                  <Input
                    {...field}
                    id="stripe-sk"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.stripeConfigured ? "••••••••••••••••" : "sk_live_…"}
                  />
                  <FieldDescription>Laisser vide pour conserver la clé actuelle.</FieldDescription>
                </Field>
              )}
            />
            <Controller
              name="stripeWebhookSecret"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="stripe-webhook">Secret du webhook</FieldLabel>
                  <Input
                    {...field}
                    id="stripe-webhook"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.stripeConfigured ? "••••••••••••••••" : "whsec_…"}
                  />
                  <FieldDescription>
                    À configurer sur l&apos;endpoint <code>/api/billing/webhook</code> dans Stripe.
                  </FieldDescription>
                </Field>
              )}
            />
            <Controller
              name="stripeMonthlyPriceId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="stripe-price">ID du prix mensuel</FieldLabel>
                  <Input {...field} id="stripe-price" placeholder="price_…" />
                  <FieldDescription>Le prix Stripe récurrent utilisé pour l&apos;abonnement Vexta.</FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <Spinner />}
            Enregistrer Stripe
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
