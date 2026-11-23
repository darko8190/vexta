"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useSendTestEmail, useUpdatePlatformSettings } from "@/hooks/use-platform-settings";
import { ApiError } from "@/lib/api";
import type { PlatformSettings } from "@/lib/types";
import { ex } from "@/lib/placeholders";

const formSchema = z.object({
  mailgunApiKey: z.string().optional(),
  mailgunDomain: z.string().optional(),
  mailgunFromEmail: z.string().email("Courriel invalide.").optional().or(z.literal("")),
  mailgunFromName: z.string().optional(),
  mailgunRegion: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export function MailgunSettingsCard({ settings }: { settings: PlatformSettings }) {
  const update = useUpdatePlatformSettings();
  const sendTest = useSendTestEmail();
  const [testRecipient, setTestRecipient] = useState("");
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mailgunApiKey: "",
      mailgunDomain: settings.mailgunDomain ?? "",
      mailgunFromEmail: settings.mailgunFromEmail ?? "",
      mailgunFromName: settings.mailgunFromName ?? "",
      mailgunRegion: settings.mailgunRegion,
    },
  });

  useEffect(() => {
    form.reset({
      mailgunApiKey: "",
      mailgunDomain: settings.mailgunDomain ?? "",
      mailgunFromEmail: settings.mailgunFromEmail ?? "",
      mailgunFromName: settings.mailgunFromName ?? "",
      mailgunRegion: settings.mailgunRegion,
    });
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    try {
      await update.mutateAsync(values);
      toast.success("Passerelle Mailgun enregistrée.");
      form.setValue("mailgunApiKey", "");
    } catch {
      toast.error("Impossible d'enregistrer la configuration Mailgun.");
    }
  }

  async function onSendTest() {
    try {
      const result = await sendTest.mutateAsync(testRecipient.trim() || null);
      toast.success(result.message);
    } catch (error) {
      // The API relays Mailgun's own refusal, which names the field to go fix.
      toast.error(error instanceof ApiError ? error.message : "L'envoi de test a échoué.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4" />
            Mailgun
          </CardTitle>
          <Badge variant={settings.mailgunConfigured ? "default" : "outline"}>
            {settings.mailgunConfigured ? "Configuré" : "Non configuré"}
          </Badge>
        </div>
        <CardDescription>Utilisé pour l&apos;envoi des courriels transactionnels de la plateforme.</CardDescription>
      </CardHeader>

      <form id="mailgun-form" onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent>
          <FieldGroup>
            <Controller
              name="mailgunDomain"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="mailgun-domain">Domaine</FieldLabel>
                  <Input {...field} id="mailgun-domain" placeholder={ex("mg.vexta.app")} />
                </Field>
              )}
            />
            <Controller
              name="mailgunApiKey"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="mailgun-key">Clé API</FieldLabel>
                  <Input
                    {...field}
                    id="mailgun-key"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.mailgunConfigured ? "••••••••••••••••" : "key-xxxxxxxxxxxx"}
                  />
                  <FieldDescription>Laisser vide pour conserver la clé actuelle.</FieldDescription>
                </Field>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="mailgunFromEmail"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="mailgun-from-email">Courriel d&apos;envoi</FieldLabel>
                    <Input {...field} id="mailgun-from-email" type="email" placeholder={ex("no-reply@vexta.app")} />
                  </Field>
                )}
              />
              <Controller
                name="mailgunFromName"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="mailgun-from-name">Nom d&apos;envoi</FieldLabel>
                    <Input {...field} id="mailgun-from-name" placeholder={ex("Vexta")} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="mailgunRegion"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="mailgun-region">Région</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="mailgun-region" className="w-full">
                      <SelectValue>
                        {(region: string) => (region === "eu" ? "Europe (eu)" : "États-Unis (us)")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us">États-Unis (us)</SelectItem>
                      <SelectItem value="eu">Europe (eu)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <Spinner />}
            Enregistrer Mailgun
          </Button>
        </CardFooter>
      </form>

      {/*
        Outside the form on purpose: a nested <form> is invalid, and the test must exercise the
        saved configuration rather than whatever is typed above but not yet enregistré.
      */}
      <CardContent className="border-t border-border pt-6">
        <Field>
          <FieldLabel htmlFor="mailgun-test-to">Envoi de test</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="mailgun-test-to"
              type="email"
              autoComplete="off"
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              placeholder={settings.mailgunFromEmail ?? "vous@entreprise.com"}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={onSendTest}
              disabled={sendTest.isPending}
            >
              {sendTest.isPending ? <Spinner /> : <Send />}
              Envoyer un test
            </Button>
          </div>
          <FieldDescription>
            Enregistrez d&apos;abord vos réglages : le test utilise ce qui est en base, pas ce qui
            est à l&apos;écran. Laissé vide, le message part vers l&apos;adresse d&apos;envoi.
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}
