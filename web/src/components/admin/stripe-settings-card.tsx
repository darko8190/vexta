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
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  stripePublishableKey: z.string().optional(),
  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  stripeConnectWebhookSecret: z.string().optional(),
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
      stripeConnectWebhookSecret: "",
    },
  });

  useEffect(() => {
    form.reset({
      stripePublishableKey: settings.stripePublishableKey ?? "",
      stripeSecretKey: "",
      stripeWebhookSecret: "",
      stripeConnectWebhookSecret: "",
    });
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    try {
      await update.mutateAsync(values);
      toast.success("Passerelle Stripe enregistrée.");
      form.setValue("stripeSecretKey", "");
      form.setValue("stripeWebhookSecret", "");
      form.setValue("stripeConnectWebhookSecret", "");
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
        <CardDescription>
          L&apos;abonnement mensuel des entreprises à Vexta, et — avec le second secret ci-dessous —
          les comptes Stripe que les entreprises branchent pour encaisser leurs propres clients.
        </CardDescription>
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
                  <Input {...field} id="stripe-pk" placeholder={ex("pk_live_…")} />
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
              name="stripeConnectWebhookSecret"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="stripe-connect-webhook">Secret du webhook Connect</FieldLabel>
                  <Input
                    {...field}
                    id="stripe-connect-webhook"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.stripeConnectConfigured ? "••••••••••••••••" : "whsec_…"}
                  />
                  <FieldDescription>
                    Un second endpoint dans Stripe, de type Connect, sur{" "}
                    <code>/api/billing/webhook/connect</code> : <code>account.updated</code> et{" "}
                    <code>checkout.session.completed</code>. C&apos;est lui qui apprend qu&apos;une
                    entreprise est autorisée à encaisser, et qu&apos;une facture a été payée.
                  </FieldDescription>
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
